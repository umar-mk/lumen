"use client";

import { useState } from "react";

const SUBJECTS = ["General question", "Classroom / school plan", "Press", "Something's broken", "Other"];

/**
 * Backend-less contact form: composes a mailto so messages actually reach us
 * during the preview. Swap for an API route when the backend lands.
 */
export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = encodeURIComponent(`${message}\n\n— ${name || "Anonymous"}${email ? ` (${email})` : ""}`);
    window.location.href = `mailto:hello@lumen.example?subject=${encodeURIComponent(`[${subject}] via lumen site`)}&body=${body}`;
  };

  const field =
    "w-full rounded-xl border border-hairline-strong bg-panel px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={field}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Topic</span>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} className={field}>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={6}
          placeholder="What's on your mind?"
          className={`${field} resize-y`}
        />
      </label>

      <button
        type="submit"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-all hover:-translate-y-0.5 hover:opacity-85"
      >
        Send message
      </button>
      <p className="text-xs text-faint">Opens your mail app — no message content touches our servers during the preview.</p>
    </form>
  );
}
