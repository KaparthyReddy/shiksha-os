"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Room } from "livekit-client";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";
interface JoinInfo {
  url: string;
  token: string;
  role: "teacher" | "student";
  canPublish: boolean;
  title: string;
}
interface Person {
  identity: string;
  name: string;
  role: string;
  hand: boolean;
}
interface ChatLine {
  id: number;
  from: string;
  text: string;
  mine: boolean;
}

const VIDEO_CLASS = "w-full rounded-xl bg-black object-contain";
const encode = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

function roleOf(meta: string | undefined): string {
  if (!meta) return "";
  try {
    const r = JSON.parse(meta)?.role;
    return typeof r === "string" ? r : "";
  } catch {
    return "";
  }
}

export default function LiveRoom({ classId, isStaff, backHref }: { classId: string; isStaff: boolean; backHref: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [share, setShare] = useState(false);
  const [handUp, setHandUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const hands = useRef<Set<string>>(new Set());
  const chatId = useRef(0);

  const refreshPeople = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const all = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
    setPeople(
      all.map((p) => ({
        identity: p.identity,
        name: p.name || "Guest",
        role: roleOf(p.metadata),
        hand: hands.current.has(p.identity),
      })),
    );
  }, []);

  const addChat = useCallback((line: Omit<ChatLine, "id">) => {
    setChat((c) => [...c.slice(-199), { ...line, id: ++chatId.current }]);
  }, []);

  useEffect(() => {
    const box = chatBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat]);

  useEffect(
    () => () => {
      roomRef.current?.disconnect();
    },
    [],
  );

  async function join() {
    setPhase("connecting");
    setError(null);
    let data: JoinInfo;
    try {
      const res = await fetch(`/api/live/${classId}/join`, { method: "POST", cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Couldn't join the class.");
        setPhase("error");
        return;
      }
      data = body as JoinInfo;
    } catch {
      setError("Can't reach the server.");
      setPhase("error");
      return;
    }
    setInfo(data);

    try {
      // Loaded only when someone joins, so the page itself stays light and server-render safe.
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        const el = track.attach();
        el.dataset.identity = participant.identity;
        if (track.kind === Track.Kind.Video) {
          el.className = VIDEO_CLASS;
          stageRef.current?.appendChild(el);
        } else {
          audioRef.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });
      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.kind === Track.Kind.Video && pub.track) {
          const el = pub.track.attach();
          el.className = VIDEO_CLASS;
          el.muted = true;
          el.dataset.identity = "local";
          stageRef.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        pub.track?.detach().forEach((el) => el.remove());
      });
      room.on(RoomEvent.ParticipantConnected, refreshPeople);
      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        hands.current.delete(p.identity);
        refreshPeople();
      });
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        let msg: { t?: unknown; text?: unknown; up?: unknown };
        try {
          msg = JSON.parse(new TextDecoder().decode(payload));
        } catch {
          return;
        }
        if (!participant) return;
        if (msg.t === "chat" && typeof msg.text === "string") {
          addChat({ from: participant.name || "Guest", text: msg.text.slice(0, 500), mine: false });
        } else if (msg.t === "hand") {
          if (msg.up === true) hands.current.add(participant.identity);
          else hands.current.delete(participant.identity);
          refreshPeople();
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        setPhase((p) => (p === "error" ? p : "ended"));
      });

      await room.connect(data.url, data.token);
      refreshPeople();
      setPhase("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect to the class.");
      setPhase("error");
    }
  }

  async function toggle(kind: "mic" | "cam" | "share") {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    setNotice(null);
    try {
      if (kind === "mic") {
        await lp.setMicrophoneEnabled(!mic);
        setMic(!mic);
      } else if (kind === "cam") {
        await lp.setCameraEnabled(!cam);
        setCam(!cam);
      } else {
        await lp.setScreenShareEnabled(!share);
        setShare(!share);
      }
    } catch {
      setNotice("Couldn't start that. Check that your browser has permission to use the camera, microphone or screen.");
    }
  }

  async function toggleHand() {
    const room = roomRef.current;
    if (!room) return;
    const up = !handUp;
    setHandUp(up);
    if (up) hands.current.add(room.localParticipant.identity);
    else hands.current.delete(room.localParticipant.identity);
    refreshPeople();
    try {
      await room.localParticipant.publishData(encode({ t: "hand", up }), { reliable: true });
    } catch {
      setNotice("Couldn't send that. Check your connection.");
    }
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim().slice(0, 500);
    const room = roomRef.current;
    if (!text || !room) return;
    setDraft("");
    addChat({ from: "You", text, mine: true });
    try {
      await room.localParticipant.publishData(encode({ t: "chat", text }), { reliable: true });
    } catch {
      setNotice("Message not sent. Check your connection.");
    }
  }

  async function endForEveryone() {
    if (!window.confirm("End this class for everyone?")) return;
    try {
      await fetch(`/api/live/${classId}/end`, { method: "POST", cache: "no-store" });
    } catch {
      /* the disconnect below still leaves the room */
    }
    roomRef.current?.disconnect();
  }

  const card = "mx-auto mt-24 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm";

  if (phase === "idle" || phase === "connecting" || phase === "error") {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className={card}>
          <h1 className="text-xl font-semibold">{isStaff ? "Start your class" : "Join the class"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {isStaff
              ? "Joining starts the class for your students. You can turn on your camera, microphone or screen share once you're in."
              : "You'll watch and listen, and you can use chat and raise your hand."}
          </p>
          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-6 flex justify-center gap-3">
            <Link href={backHref} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
              Back
            </Link>
            <button
              onClick={() => void join()}
              disabled={phase === "connecting"}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {phase === "connecting" ? "Connecting…" : "Join class"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "ended") {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className={card}>
          <h1 className="text-xl font-semibold">The class has ended</h1>
          <p className="mt-2 text-sm text-slate-600">You&apos;re no longer connected.</p>
          <Link href={backHref} className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Back
          </Link>
        </div>
      </main>
    );
  }

  const btn = "rounded-lg border px-3 py-2 text-sm";
  const on = "border-indigo-500 bg-indigo-50 text-indigo-800";
  const off = "border-slate-300 hover:bg-slate-100";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{info?.title}</div>
          <div className="text-xs text-emerald-700">● Live</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isStaff ? (
            <>
              <button onClick={() => void toggle("mic")} className={`${btn} ${mic ? on : off}`}>
                {mic ? "Mute mic" : "Mic"}
              </button>
              <button onClick={() => void toggle("cam")} className={`${btn} ${cam ? on : off}`}>
                {cam ? "Stop camera" : "Camera"}
              </button>
              <button onClick={() => void toggle("share")} className={`${btn} ${share ? on : off}`}>
                {share ? "Stop sharing" : "Share screen"}
              </button>
              <button onClick={() => void endForEveryone()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
                End class
              </button>
            </>
          ) : (
            <button onClick={() => void toggleHand()} className={`${btn} ${handUp ? on : off}`}>
              {handUp ? "Lower hand" : "Raise hand"}
            </button>
          )}
          <button onClick={() => roomRef.current?.disconnect()} className={`${btn} ${off}`}>
            Leave
          </button>
        </div>
      </header>

      {notice && <div className="bg-amber-100 px-4 py-2 text-sm text-amber-900">{notice}</div>}

      <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_320px]">
        <section>
          <div ref={stageRef} className="grid gap-3 empty:hidden" />
          <p className="mt-2 text-xs text-slate-500">
            {isStaff
              ? "Your camera and screen share appear here. Students see them live."
              : "The teacher's camera and screen share appear here once they are on."}
          </p>
          <div ref={audioRef} className="hidden" />
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">In class ({people.length})</div>
            <ul className="max-h-40 space-y-1 overflow-auto text-sm">
              {people.map((p) => (
                <li key={p.identity} className="flex items-center justify-between">
                  <span>
                    {p.name} {p.role === "teacher" && <span className="text-xs text-indigo-600">(teacher)</span>}
                  </span>
                  {p.hand && <span title="Hand raised">✋</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Chat</div>
            <div ref={chatBox} className="h-56 space-y-1 overflow-auto text-sm">
              {chat.length === 0 && <p className="text-slate-400">No messages yet.</p>}
              {chat.map((c) => (
                <div key={c.id} className={c.mine ? "text-right" : ""}>
                  <span className="text-xs text-slate-500">{c.from}</span>
                  <div className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-2 py-1 ${c.mine ? "bg-indigo-50" : "bg-slate-100"}`}>
                    {c.text}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={(e) => void sendChat(e)} className="mt-2 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
                placeholder="Type a message"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">Send</button>
            </form>
          </div>
        </aside>
      </main>
    </div>
  );
}
