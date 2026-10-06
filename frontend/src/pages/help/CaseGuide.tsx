import React from 'react';
import { BookOpen } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';

// Status pill colors reused verbatim from AppointmentList.tsx's APPT_STATUS_COLORS so the
// glossary reads as the same badges staff already see on the Appointments list.
const STATUS_COLORS: Record<string, string> = {
  WAITING:    'bg-gray-100 text-gray-700',
  ASSIGNED:   'bg-blue-100 text-blue-700',
  REGISTERED: 'bg-green-100 text-green-700',
  COMPLETED:  'bg-green-100 text-green-700',
  HOLD:       'bg-orange-100 text-orange-700',
  DROPPED:    'bg-red-100 text-red-700',
};

const Pill: React.FC<{ status: keyof typeof STATUS_COLORS; label?: string }> = ({ status, label }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[status]}`}>
    {label ?? status.charAt(0) + status.slice(1).toLowerCase()}
  </span>
);

const Frame: React.FC<{ src: string; url: string; alt: string; caption: React.ReactNode }> = ({ src, url, alt, caption }) => (
  <figure className="flex-1 min-w-[280px] bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-gray-50">
      <span className="w-2 h-2 rounded-full bg-gray-300" />
      <span className="w-2 h-2 rounded-full bg-gray-300" />
      <span className="w-2 h-2 rounded-full bg-gray-300" />
      <span className="ml-2 text-[11px] font-mono text-gray-400 truncate">{url}</span>
    </div>
    <img src={src} alt={alt} className="w-full h-auto" loading="lazy" />
    <figcaption className="px-3 py-2.5 text-xs text-gray-500">{caption}</figcaption>
  </figure>
);

const Section: React.FC<{ id: string; eyebrow: string; eyebrowColor: string; title: string; subtitle: string; children: React.ReactNode }> = ({
  id, eyebrow, eyebrowColor, title, subtitle, children,
}) => (
  <section id={id} className="py-10 border-b border-gray-200 last:border-b-0 scroll-mt-6">
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wide ${eyebrowColor}`}>
      {eyebrow}
    </span>
    <h2 className="text-2xl font-bold text-gray-900 mt-3 mb-1.5">{title}</h2>
    <p className="text-gray-500 max-w-2xl mb-5">{subtitle}</p>
    {children}
  </section>
);

const TOC = [
  { id: 'intake', label: 'New Client' },
  { id: 'appointment', label: 'Appointment' },
  { id: 'fileprocessing', label: 'File Processing' },
  { id: 'invoicing', label: 'Invoicing' },
  { id: 'holddrop', label: 'Hold & Drop' },
  { id: 'glossary', label: 'Status Glossary' },
  { id: 'faq', label: 'Common Questions' },
];

const FaqItem: React.FC<{ q: string; a: string; defaultOpen?: boolean }> = ({ q, a, defaultOpen }) => (
  <details className="border-b border-gray-200 py-4 last:border-b-0" open={defaultOpen}>
    <summary className="font-semibold text-gray-900 text-sm cursor-pointer list-none flex justify-between gap-3">
      {q}
      <span className="text-indigo-600 font-mono">+</span>
    </summary>
    <p className="text-sm text-gray-500 mt-2 max-w-2xl">{a}</p>
  </details>
);

const CaseGuide: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-x-10">
      {/* Cover */}
      <div className="col-span-full pb-8 mb-2 border-b border-gray-200">
        <div className="flex items-center gap-2 text-indigo-600 mb-3">
          <BookOpen className="w-5 h-5" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wide">Ops Reference</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Case Workflow Guide</h1>
        <p className="text-gray-500 max-w-2xl">
          A walk through one real case, start to finish &mdash; from a client walking in, to the
          appointment being booked, to the final invoice. Every screen below is this app, not a mock-up.
        </p>
        <div className="flex flex-wrap gap-6 text-xs text-gray-400 mt-5">
          <div><span className="block font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Covers</span>Intake · Appointment · File Processing · Invoicing · Hold & Drop</div>
          <div><span className="block font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Worked example</span>Client CL-117, Sarah Demo · Netherlands</div>
        </div>
      </div>

      {/* TOC */}
      <nav className="hidden lg:flex flex-col gap-0.5 h-fit sticky top-6 py-6">
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wide text-gray-400 mb-2">On this page</span>
        {TOC.map(t => (
          <a key={t.id} href={`#${t.id}`} className="text-sm text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md px-2.5 py-1.5 transition-colors">
            {t.label}
          </a>
        ))}
      </nav>

      <main className="min-w-0">

        <Section id="intake" eyebrow="Stage 1 · Intake" eyebrowColor="bg-gray-100 text-gray-700"
          title="A new client walks in" subtitle="Every client starts in one place: Clients → Add Client. Fill in their personal details, passport, and where they're applying to — the system does the rest.">
          <p className="text-sm text-gray-600 max-w-2xl mb-5">
            The form is split into sections so nothing gets missed: personal information, passport details,
            the visa application itself, and an admin section for received date, source, and internal notes.
          </p>
          <div className="flex flex-wrap gap-5 mb-5">
            <Frame src="/guide/01-add-form-personal.jpg" url="/clients/new" alt="Add client form, personal information" caption="Personal information — name, DOB, nationality, contact details." />
            <Frame src="/guide/02-add-form-admin.jpg" url="/clients/new" alt="Add client form, administrative section" caption="Admin section — received date, source, service type, internal notes." />
          </div>
          <Alert variant="info" title="Service Type matters"
            message="Full Service takes a case through Appointment → File Processing → Invoiced → Completed. Appointment Only skips straight from Appointment to Completed once the booking is made — no file processing, no invoice." />
          <p className="text-sm text-gray-600 max-w-2xl my-5">
            The moment you hit <strong className="text-gray-900">Create Client</strong>, two things happen automatically: a client reference is
            issued (<code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">CL-117</code> in our example), and a case is opened at the
            <strong className="text-gray-900"> Appointment</strong> stage with status <Pill status="WAITING" />.
          </p>
          <div className="flex flex-wrap gap-5">
            <Frame src="/guide/03-client-created.jpg" url="/clients/CL-117" alt="Client profile created" caption="Client CL-117 · Sarah Demo, created and ready." />
            <Frame src="/guide/04-visa-case.jpg" url="/clients/CL-117" alt="Case opened automatically" caption="Their case, opened automatically — Netherlands, stage Appointment." />
          </div>
        </Section>

        <Section id="appointment" eyebrow="Stage 2 · Appointment" eyebrowColor="bg-blue-100 text-blue-700"
          title="Waiting → Assigned → Registered" subtitle="Click Manage on the case to open Case Detail — where the appointment team lives day to day.">
          <p className="text-sm text-gray-600 max-w-2xl mb-5">
            A stepper at the top shows exactly where the case sits, and the system won't let it skip a stage.
            Below it, Appointment Details holds everything from the old Appointment Sheet and staff sheets, combined.
          </p>
          <div className="mb-6">
            <Frame src="/guide/05-appt-fields-blank.jpg" url="/cases/…" alt="Blank appointment fields" caption="Fresh case — nobody assigned yet, status Waiting." />
          </div>

          <h3 className="text-xs font-mono font-semibold uppercase tracking-wide text-gray-400 mb-2 mt-8">Assigning staff</h3>
          <p className="text-sm text-gray-600 max-w-2xl mb-5">
            Pick a name from <strong className="text-gray-900">Appointment Team Assignee</strong> — the equivalent of the old
            "Assigned To" dropdown, with the row jumping to that person's sheet.
          </p>
          <div className="mb-6">
            <Frame src="/guide/06-assigned.jpg" url="/cases/…" alt="Assigned to Adam Appointments" caption="Assigned to Adam Appointments — status flips to Assigned." />
          </div>

          <h3 className="text-xs font-mono font-semibold uppercase tracking-wide text-gray-400 mb-2 mt-8">Registering & booking</h3>
          <p className="text-sm text-gray-600 max-w-2xl mb-5">
            Once prepped, set status to <Pill status="REGISTERED" /> and add a <strong className="text-gray-900">Registered Email</strong> on
            the client's profile — a company OTP inbox, never the client's personal one. VFS needs the code back
            in seconds, and a client checking their phone loses the slot. When VFS confirms a slot, the
            <strong className="text-gray-900"> Appointment Date</strong> goes in here too, along with charges and any advance taken.
          </p>
          <Alert variant="info" title="Why a separate email?"
            message="The client's own email stays in their profile for normal communication. Registered Email is strictly for VFS OTPs, pulled from a company list — exactly the split the old Excel column enforced." className="mb-5" />
          <div className="mb-4">
            <Frame src="/guide/07-registered.jpg" url="/cases/…" alt="Registered with email and appointment date" caption="Registered, dated, and priced — ready to move on." />
          </div>
          <p className="text-sm text-gray-600 max-w-2xl">
            Until an appointment date is on file, <strong className="text-gray-900">Advance to File Processing</strong> stays locked —
            the system's version of "don't move the row until the booking is real."
          </p>
        </Section>

        <Section id="fileprocessing" eyebrow="Stage 3 · File Processing" eyebrowColor="bg-green-100 text-green-700"
          title="The document checklist" subtitle="Advancing the case reveals a read-only summary of everything the appointment team entered, plus a document checklist the file team works through.">
          <div className="flex flex-wrap gap-5 mb-5">
            <Frame src="/guide/08-fileprocessing-stepper.jpg" url="/cases/…" alt="File processing stepper" caption="Appointment closed off — File Processing is live." />
            <Frame src="/guide/09-checklist.jpg" url="/cases/…" alt="Document checklist" caption="Appointment marked Done; the rest still Pending." />
          </div>
          <p className="text-sm text-gray-600 max-w-2xl">
            Each document line tracks its own status, who paid for it — client or agency — and the cost,
            so nothing about who covered what gets lost between the file team and accounts.
          </p>
        </Section>

        <Section id="invoicing" eyebrow="Stage 4 · Invoicing & Completion" eyebrowColor="bg-green-100 text-green-700"
          title="One click writes the invoice" subtitle="Advance to Invoiced doesn't just flip a label — it builds a real invoice from everything already on the case: service charges, per-document costs, and any advance already paid.">
          <div className="mb-5">
            <Frame src="/guide/10-invoice-preview.jpg" url="/cases/… · Preview Invoice" alt="Invoice preview modal" caption="The advance already taken is deducted automatically before it asks you to confirm." />
          </div>
          <p className="text-sm text-gray-600 max-w-2xl mb-5">
            Confirming creates the invoice, numbers it, and moves the case straight to
            <Pill status="COMPLETED" /> in the same step — there's no separate "mark as invoiced" click to forget.
          </p>
          <div className="flex flex-wrap gap-5">
            <Frame src="/guide/11-invoice-created.jpg" url="/cases/…" alt="Invoice created confirmation" caption={<>Invoice <code className="font-mono">INV-1008</code> — and the case is done.</>} />
            <Frame src="/guide/12-completed.jpg" url="/cases/…" alt="Completed case, locked" caption="Locked and read-only from here — the case's permanent record." />
          </div>
        </Section>

        <Section id="holddrop" eyebrow="Special Cases" eyebrowColor="bg-orange-100 text-orange-700"
          title="When a case pauses — or ends early" subtitle="Not every case runs straight through. Two buttons at the top of every open case handle the exceptions: Pause and Cancel Case.">
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wide text-gray-400 mb-2">Hold</h3>
          <p className="text-sm text-gray-600 max-w-2xl mb-5">
            Client's travelling, needs to push the date, has gone quiet for a week — click
            <strong className="text-gray-900"> Pause</strong> and write the reason. The case is frozen: nothing can advance
            until someone hits <strong className="text-gray-900">Resume</strong>.
          </p>
          <div className="mb-8">
            <Frame src="/guide/14-paused.jpg" url="/cases/…" alt="Paused case with reason" caption="A held case — reason on record, workflow locked until resumed." />
          </div>

          <h3 className="text-xs font-mono font-semibold uppercase tracking-wide text-gray-400 mb-2">Drop</h3>
          <p className="text-sm text-gray-600 max-w-2xl mb-5">
            If a client withdraws, <strong className="text-gray-900">Cancel Case</strong> ends the workflow for good — unlike Pause,
            this can't be undone from the case screen. The record stays for the audit trail, marked clearly,
            and drops out of every active list and stat tile.
          </p>
          <div className="mb-5">
            <Frame src="/guide/15-cancelled.jpg" url="/cases/…" alt="Cancelled case" caption="Cancelled — out of the active queue, kept for the record." />
          </div>
          <Alert variant="warning" title="Heads up"
            message="Today, Cancel Case records that a case was dropped, but it doesn't yet prompt for a refund amount or reason. If a deposit needs returning, log it in HR Comments on the client profile until that field lands." />
        </Section>

        <Section id="glossary" eyebrow="Reference" eyebrowColor="bg-gray-100 text-gray-700"
          title="Appointment status, at a glance" subtitle="The status shown on the Appointments list and on every case — what it means, and who moves it forward.">
          <div className="overflow-x-auto mb-6 -mx-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-[11px] font-mono uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-2 border-b border-gray-200">Status</th>
                  <th className="px-3 py-2 border-b border-gray-200">What it means</th>
                  <th className="px-3 py-2 border-b border-gray-200">Who sets it</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr><td className="px-3 py-3 border-b border-gray-100"><Pill status="WAITING" /></td><td className="px-3 py-3 border-b border-gray-100">New case, nobody assigned yet.</td><td className="px-3 py-3 border-b border-gray-100">Automatic, on client creation.</td></tr>
                <tr><td className="px-3 py-3 border-b border-gray-100"><Pill status="ASSIGNED" /></td><td className="px-3 py-3 border-b border-gray-100">A staff member is now responsible for it.</td><td className="px-3 py-3 border-b border-gray-100">Whoever sets Appointment Team Assignee.</td></tr>
                <tr><td className="px-3 py-3 border-b border-gray-100"><Pill status="REGISTERED" /></td><td className="px-3 py-3 border-b border-gray-100">Initial prep done; operational email attached.</td><td className="px-3 py-3 border-b border-gray-100">The assigned staff member, or a manager directly.</td></tr>
                <tr><td className="px-3 py-3 border-b border-gray-100"><Pill status="COMPLETED" /></td><td className="px-3 py-3 border-b border-gray-100">Slot booked: date, staff and details all confirmed.</td><td className="px-3 py-3 border-b border-gray-100">Whoever books with VFS.</td></tr>
                <tr><td className="px-3 py-3 border-b border-gray-100"><Pill status="HOLD" /></td><td className="px-3 py-3 border-b border-gray-100">Paused — reason logged, workflow frozen.</td><td className="px-3 py-3 border-b border-gray-100">Anyone, via the Pause button.</td></tr>
                <tr><td className="px-3 py-3"><Pill status="DROPPED" /></td><td className="px-3 py-3">Client withdrew; case closed permanently.</td><td className="px-3 py-3">Anyone, via Cancel Case.</td></tr>
              </tbody>
            </table>
          </div>
          <Frame src="/guide/13-appt-list.jpg" url="/appointments" alt="Appointments list" caption="The Appointments list — every open case, filterable by status and city." />
        </Section>

        <Section id="faq" eyebrow="Quick Answers" eyebrowColor="bg-blue-100 text-blue-700"
          title="Questions the team keeps asking" subtitle="">
          <div>
            <FaqItem defaultOpen
              q="Why won't &ldquo;Advance to File Processing&rdquo; click?"
              a="The button stays greyed out until the case has an Appointment Date on file and the client's required details are complete. It's a safety gate, not a bug — it stops a case moving forward before there's actually a booking to hand over." />
            <FaqItem
              q="Can I move a case backward, or skip a stage?"
              a="No. Cases only move forward one stage at a time — Appointment → File Processing → Invoiced → Completed. If something needs correcting, edit the details on the current stage rather than trying to jump back." />
            <FaqItem
              q="What's the difference between the client's Email and their Registered Email?"
              a="Email is the client's own address, used for normal contact. Registered Email is an internal company inbox used only to receive VFS OTP codes at booking time — it must be set before a case can move to Registered." />
            <FaqItem
              q="Does creating an invoice send anything to the client?"
              a="No. Confirming an invoice creates the record and moves the case to Completed; nothing is emailed automatically. Use Download Invoice (or Download PDF in the preview) to get a copy to send yourself." />
            <FaqItem
              q="A client wants to pause, not cancel — which button do I use?"
              a="Pause. It freezes the case and keeps every detail exactly as it was, ready to Resume the moment the client's back in touch. Cancel Case is for a genuine withdrawal and can't be reversed from the case screen." />
          </div>
        </Section>

      </main>
    </div>
  );
};

export default CaseGuide;
