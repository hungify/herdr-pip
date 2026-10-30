import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {herdrCommand, summarize} from './herdr.ts';
import type {Summary} from './herdr.ts';

const POLL_TIMEOUT_S = 10;

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

function findHerdr(): string | null {
    const local = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'herdr']);
    return GLib.find_program_in_path('herdr') ?? (GLib.file_test(local, GLib.FileTest.IS_EXECUTABLE) ? local : null);
}

export class HerdrCli {
    private readonly _session: () => string;
    private readonly _onSummary: (summary: Summary) => void;
    private readonly _cancellable = new Gio.Cancellable();
    private readonly _procs = new Set<Gio.Subprocess>();
    private _sourceId = 0;
    private _poll: Gio.Subprocess | null = null;
    private _killId = 0;

    constructor(session: () => string, onSummary: (summary: Summary) => void) {
        this._session = session;
        this._onSummary = onSummary;
    }

    destroy(): void {
        this._stopTimer();
        this._cancellable.cancel();
        this._dropPoll();
        for (const proc of this._procs) {
            proc.force_exit();
        }
        this._procs.clear();
    }

    start(seconds: number): void {
        this._stopTimer();
        this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this.poll();
            return GLib.SOURCE_CONTINUE;
        });
        this.poll();
    }

    restart(): void {
        this._dropPoll();
        this.poll();
    }

    poll(): void {
        if (this._poll) {
            return;
        }
        const argv = this._argv('agent', 'list');
        if (!argv) {
            this._onSummary(summarize({missing: true}));
            return;
        }

        let proc: Gio.Subprocess;
        try {
            proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            this._onSummary(summarize({exitOk: false, stderr: errorMessage(e)}));
            return;
        }
        this._poll = proc;
        this._killId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_TIMEOUT_S, () => {
            this._killId = 0;
            proc.force_exit();
            return GLib.SOURCE_REMOVE;
        });

        proc.communicate_utf8_async(null, this._cancellable, (_source, res) => {
            let summary: Summary;
            try {
                const [, stdout, stderr] = proc.communicate_utf8_finish(res) as [boolean, string | null, string | null];
                summary = summarize({exitOk: proc.get_successful(), stdout: stdout ?? '', stderr: stderr ?? ''});
            } catch (e) {
                if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    return;
                }
                summary = summarize({exitOk: false, stderr: errorMessage(e)});
            }
            if (this._cancellable.is_cancelled() || this._poll !== proc) {
                return;
            }
            this._clearKill();
            this._poll = null;
            this._onSummary(summary);
        });
    }

    focus(paneId: string): boolean {
        const argv = this._argv('agent', 'focus', paneId);
        if (!argv) {
            return false;
        }
        let proc: Gio.Subprocess;
        try {
            proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_SILENCE);
        } catch (e) {
            console.error(`herdr-pip: failed to run ${argv[0] ?? '?'}: ${errorMessage(e)}`);
            return true;
        }
        this._procs.add(proc);
        proc.wait_check_async(this._cancellable, (_source, res) => {
            this._procs.delete(proc);
            try {
                proc.wait_check_finish(res);
            } catch (e) {
                if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    return;
                }
                console.error(`herdr-pip: agent focus ${paneId} failed: ${errorMessage(e)}`);
            }
        });
        return true;
    }

    private _argv(...args: string[]): string[] | null {
        const herdr = findHerdr();
        return herdr !== null ? herdrCommand(herdr, this._session(), ...args) : null;
    }

    private _dropPoll(): void {
        this._clearKill();
        this._poll?.force_exit();
        this._poll = null;
    }

    private _clearKill(): void {
        if (this._killId) {
            GLib.source_remove(this._killId);
            this._killId = 0;
        }
    }

    private _stopTimer(): void {
        if (this._sourceId) {
            GLib.source_remove(this._sourceId);
            this._sourceId = 0;
        }
    }
}
