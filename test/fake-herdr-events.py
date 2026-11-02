"""Fake herdr API socket for the smoke test: acks events.subscribe and streams one event per trigger file.

Usage: fake-herdr-events.py SOCKET_PATH. Each subscribe request is appended to $HOME/fake-subscribe.log; creating
$HOME/fake-event sends one pane.agent_status_changed event to every open stream and removes the file.
"""

import json
import os
import socket
import sys
import threading
import time

home = os.environ["HOME"]
path = sys.argv[1]
streams: list[socket.socket] = []
lock = threading.Lock()


def serve(conn: socket.socket) -> None:
    line = conn.makefile("r").readline()
    with open(os.path.join(home, "fake-subscribe.log"), "a") as log:
        log.write(line if line.endswith("\n") else line + "\n")
    request = json.loads(line)
    conn.sendall((json.dumps({"id": request["id"], "result": {"type": "subscription_started"}}) + "\n").encode())
    with lock:
        streams.append(conn)


def trigger() -> None:
    event = json.dumps({"event": "pane.agent_status_changed", "data": {"pane_id": "wA:p1", "workspace_id": "wA", "agent_status": "done"}})
    flag = os.path.join(home, "fake-event")
    while True:
        if os.path.exists(flag):
            os.remove(flag)
            with lock:
                for conn in list(streams):
                    try:
                        conn.sendall((event + "\n").encode())
                    except OSError:
                        streams.remove(conn)
        time.sleep(0.1)


if os.path.exists(path):
    os.remove(path)
server = socket.socket(socket.AF_UNIX)
server.bind(path)
server.listen()
threading.Thread(target=trigger, daemon=True).start()
while True:
    conn, _ = server.accept()
    threading.Thread(target=serve, args=(conn,), daemon=True).start()
