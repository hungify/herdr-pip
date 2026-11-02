import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseSocketPath, parseStreamLine, subscribeRequest} from './herdr.ts';

const RETRY_MIN_S = 2;
const RETRY_MAX_S = 60;
const STATUS_TIMEOUT_S = 5;

function sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

function isCancelled(e: unknown): boolean {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

export function promisifyEvents(): void {
    Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
    Gio._promisify(Gio.SocketClient.prototype, 'connect_async');
    Gio._promisify(Gio.OutputStream.prototype, 'write_all_async');
    Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async');
}

export class HerdrEvents {
    private readonly _argv: (...args: string[]) => string[] | null;
    private readonly _onEvent: () => void;
    private readonly _onLive: (live: boolean) => void;
    private _panes: string[] | null = null;
    private _cancellable: Gio.Cancellable | null = null;
    private _live = false;
    private _retryId = 0;
    private _retryS = RETRY_MIN_S;
    private _warned = false;

    constructor(argv: (...args: string[]) => string[] | null, onEvent: () => void, onLive: (live: boolean) => void) {
        this._argv = argv;
        this._onEvent = onEvent;
        this._onLive = onLive;
    }

    get live(): boolean {
        return this._live;
    }

    setPanes(paneIds: readonly string[]): void {
        const panes = paneIds.toSorted();
        if (this._panes && sameIds(panes, this._panes)) {
            return;
        }
        this._panes = panes;
        this._retryS = RETRY_MIN_S;
        this._connect();
    }

    stop(): void {
        this._panes = null;
        this._disconnect();
    }

    destroy(): void {
        this.stop();
    }

    private _connect(): void {
        this._disconnect();
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        this._stream(cancellable, this._panes ?? []).catch((e: unknown) => {
            if (isCancelled(e) || cancellable.is_cancelled()) {
                return;
            }
            if (!this._warned) {
                this._warned = true;
                console.warn(
                    `herdr-pip: event stream unavailable, polling instead: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
            this._disconnect();
            this._retryId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._retryS, () => {
                this._retryId = 0;
                this._connect();
                return GLib.SOURCE_REMOVE;
            });
            this._retryS = Math.min(this._retryS * 2, RETRY_MAX_S);
        });
    }

    private async _stream(cancellable: Gio.Cancellable, panes: readonly string[]): Promise<void> {
        const path = parseSocketPath(await this._status(cancellable));
        if (path === null) {
            throw new Error('herdr status server printed no socket path');
        }
        const conn = await new Gio.SocketClient().connect_async(Gio.UnixSocketAddress.new(path), cancellable);
        cancellable.connect(() => {
            conn.close(null);
        });
        await conn
            .get_output_stream()
            .write_all_async(new TextEncoder().encode(subscribeRequest(panes)), GLib.PRIORITY_DEFAULT, cancellable);
        const input = new Gio.DataInputStream({base_stream: conn.get_input_stream()});
        const decoder = new TextDecoder();
        for (;;) {
            const [line] = await input.read_line_async(GLib.PRIORITY_DEFAULT, cancellable);
            if (line === null) {
                throw new Error('herdr closed the event stream');
            }
            const msg = parseStreamLine(decoder.decode(line));
            if (msg.kind === 'started') {
                this._retryS = RETRY_MIN_S;
                this._warned = false;
                this._setLive(true);
            } else if (msg.kind === 'event') {
                this._onEvent();
            } else if (msg.kind === 'error') {
                throw new Error(msg.message);
            }
        }
    }

    private async _status(cancellable: Gio.Cancellable): Promise<string> {
        const argv = this._argv('status', 'server');
        if (!argv) {
            throw new Error('herdr not found');
        }
        const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        let killId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, STATUS_TIMEOUT_S, () => {
            killId = 0;
            proc.force_exit();
            return GLib.SOURCE_REMOVE;
        });
        try {
            const [stdout] = await proc.communicate_utf8_async(null, cancellable);
            return stdout;
        } finally {
            if (killId) {
                GLib.source_remove(killId);
            }
            if (cancellable.is_cancelled()) {
                proc.force_exit();
            }
        }
    }

    private _disconnect(): void {
        if (this._retryId) {
            GLib.source_remove(this._retryId);
            this._retryId = 0;
        }
        this._cancellable?.cancel();
        this._cancellable = null;
        this._setLive(false);
    }

    private _setLive(live: boolean): void {
        if (live !== this._live) {
            this._live = live;
            this._onLive(live);
        }
    }
}
