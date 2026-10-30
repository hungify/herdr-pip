import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {isHerdrClient, parsePpid, pickHerdrWindow, windowOwner} from './herdr.ts';

export function promisifyGio(): void {
    Gio._promisify(Gio.File.prototype, 'load_contents_async');
    Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
    Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
}

async function readText(path: string, cancellable: Gio.Cancellable): Promise<string> {
    try {
        const [contents] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
        return new TextDecoder().decode(contents);
    } catch {
        return '';
    }
}

async function userPids(cancellable: Gio.Cancellable): Promise<number[]> {
    const user = GLib.get_user_name();
    const pids: number[] = [];
    let children: Gio.FileEnumerator;
    try {
        children = await Gio.File.new_for_path('/proc').enumerate_children_async(
            'standard::name,owner::user',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            cancellable,
        );
    } catch {
        return pids;
    }
    try {
        for (;;) {
            const infos = await children.next_files_async(256, GLib.PRIORITY_DEFAULT, cancellable);
            if (!infos.length) {
                break;
            }
            for (const info of infos) {
                const pid = Number(info.get_name());
                if (Number.isInteger(pid) && info.get_attribute_string('owner::user') === user) {
                    pids.push(pid);
                }
            }
        }
    } finally {
        children.close(null);
    }
    return pids;
}

async function herdrClientPids(session: string, cancellable: Gio.Cancellable): Promise<number[]> {
    const pids = await userPids(cancellable);
    const argvs = await Promise.all(pids.map(pid => readText(`/proc/${pid}/cmdline`, cancellable)));
    return pids.filter((_pid, i) => isHerdrClient((argvs[i] ?? '').split('\0').filter(Boolean), session));
}

export async function findHerdrWindow(session: string, cancellable: Gio.Cancellable): Promise<Meta.Window | null> {
    const clients = await herdrClientPids(session, cancellable);
    if (!clients.length || cancellable.is_cancelled()) {
        return null;
    }

    const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
    const windowPids = new Set<number>(windows.map(w => w.get_pid()));
    const parent = async (pid: number) => parsePpid(await readText(`/proc/${pid}/stat`, cancellable));
    const owners = new Set(
        (await Promise.all(clients.map(pid => windowOwner(pid, p => windowPids.has(p), parent)))).filter(p => p > 0),
    );
    if (cancellable.is_cancelled()) {
        return null;
    }
    return pickHerdrWindow(
        windows.filter(w => owners.has(w.get_pid())),
        w => w.get_title() as string | null,
    );
}
