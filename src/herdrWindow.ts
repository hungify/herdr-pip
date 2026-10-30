import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {isHerdrClient, parsePpid, pickHerdrWindow} from './herdr.ts';

function promise<T>(
    start: (done: (_source: unknown, res: Gio.AsyncResult) => void) => void,
    finish: (res: Gio.AsyncResult) => T,
): Promise<T> {
    return new Promise((resolve, reject) => {
        start((_source, res) => {
            try {
                resolve(finish(res));
            } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
    });
}

function loadContents(file: Gio.File, cancellable: Gio.Cancellable): Promise<Uint8Array> {
    return promise(
        done => {
            file.load_contents_async(cancellable, done);
        },
        res => file.load_contents_finish(res)[1],
    );
}

function enumerateChildren(
    file: Gio.File,
    attributes: string,
    cancellable: Gio.Cancellable,
): Promise<Gio.FileEnumerator> {
    return promise(
        done => {
            file.enumerate_children_async(
                attributes,
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                cancellable,
                done,
            );
        },
        res => file.enumerate_children_finish(res),
    );
}

function nextFiles(enumerator: Gio.FileEnumerator, cancellable: Gio.Cancellable): Promise<Gio.FileInfo[]> {
    return promise(
        done => {
            enumerator.next_files_async(256, GLib.PRIORITY_DEFAULT, cancellable, done);
        },
        res => enumerator.next_files_finish(res),
    );
}

async function readText(path: string, cancellable: Gio.Cancellable): Promise<string> {
    try {
        return new TextDecoder().decode(await loadContents(Gio.File.new_for_path(path), cancellable));
    } catch {
        return '';
    }
}

async function userPids(cancellable: Gio.Cancellable): Promise<number[]> {
    const user = GLib.get_user_name();
    const pids: number[] = [];
    let children: Gio.FileEnumerator;
    try {
        children = await enumerateChildren(Gio.File.new_for_path('/proc'), 'standard::name,owner::user', cancellable);
    } catch {
        return pids;
    }
    try {
        for (;;) {
            const infos = await nextFiles(children, cancellable);
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
    const owners = new Set<number>();
    for (const pid of await herdrClientPids(session, cancellable)) {
        for (let p = pid; p > 1 && !owners.has(p); p = parsePpid(await readText(`/proc/${p}/stat`, cancellable))) {
            owners.add(p);
        }
    }
    if (!owners.size || cancellable.is_cancelled()) {
        return null;
    }

    const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).filter(w => owners.has(w.get_pid()));
    return pickHerdrWindow(windows, w => w.get_title() as string | null);
}
