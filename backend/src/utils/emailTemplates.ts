// The wording of the three client emails. The welcome email is the text Manzil supplied. The
// hotel cancellation and flight check-in emails are DRAFT wording awaiting Manzil's approval,
// and only go out when EMAIL_REMINDERS_ENABLED is true.

export interface RenderedEmail { subject: string; text: string; html: string }

type Block = { p: string } | { ol: string[] };

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SIGNATURE = [
  'Ibtasam Afzal',
  'Director & Lead Consultant',
  'Manzil Consultancy®',
  '',
  'T: 07947 478899',
  'E: visa@manzilconsultancy.com',
  'W: www.manzilconsultancy.com',
  '',
  'Manzil Travels Ltd (trading as Manzil Consultancy®)',
  'Company No. 15768600 | ICO Reg. ZC075780 | TM Reg. UK00004334804',
  'Registered Office: 124 City Road, London, EC1V 2NX',
];

const DISCLAIMER = 'This email and any attachments are confidential and intended solely for the named recipient. '
  + 'If you have received this in error, please notify us immediately and delete it. Your personal data is handled '
  + 'in accordance with UK GDPR — for our full Privacy Policy visit www.manzilconsultancy.com.';

const render = (subject: string, blocks: Block[]): RenderedEmail => {
  const textBlocks = blocks.map(b => ('p' in b ? b.p : b.ol.map((item, i) => `${i + 1}. ${item}`).join('\n')));
  const text = [...textBlocks, 'Warm regards,', SIGNATURE.join('\n'), '---', DISCLAIMER].join('\n\n');

  const htmlBlocks = blocks.map(b => ('p' in b
    ? `<p>${escapeHtml(b.p)}</p>`
    : `<ol>${b.ol.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`));
  const [name, ...rest] = SIGNATURE;
  const signature = `<p><strong>${escapeHtml(name)}</strong><br>${rest.map(escapeHtml).join('<br>')}</p>`;
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;max-width:640px">'
    + htmlBlocks.join('')
    + '<p>Warm regards,</p>'
    + signature
    + '<hr style="border:none;border-top:1px solid #ccc;margin:20px 0">'
    + `<p style="font-size:12px;color:#666">${escapeHtml(DISCLAIMER)}</p>`
    + '</div>';

  return { subject, text, html };
};

export const welcomeEmail = (v: { clientName: string; country: string; reference: string }): RenderedEmail =>
  render(`Welcome to Manzil Consultancy® — Your ${v.country} Visa Application | Ref: ${v.reference}`, [
    { p: `Dear ${v.clientName},` },
    { p: `Thank you for choosing Manzil Consultancy® to assist with your ${v.country} visa application. Your reference number is ${v.reference}.` },
    { p: 'We are pleased to confirm that we have received your documents and we are now actively working on your file.' },
    { p: 'By sharing your documents with us and instructing us to proceed, you have confirmed your agreement to our Standard Terms of Business and the terms set out in the enclosed Client Care Letter. No further action is required from you.' },
    { p: 'Please find the following documents enclosed for your records:' },
    { ol: [
      'Client Care Letter — outlines the service we will provide, our fees, timescales, and what you can expect from us.',
      'Client Declaration — sets out the terms of our agreement for your reference.',
      'Standard Terms of Business — the full terms governing our agreement.',
    ] },
    { p: 'All documents are for your records only. No signatures or returns are required.' },
    { p: 'We will keep you updated at every stage of your application via this email and your dedicated WhatsApp group. If you have any questions at any point, please do not hesitate to contact us.' },
    { p: 'We look forward to working with you.' },
  ]);

export const hotelCancellationEmail = (v: { clientName: string; country: string; reference: string; date: string }): RenderedEmail =>
  render(`Hotel Booking Cancellation — Your ${v.country} Visa Application | Ref: ${v.reference}`, [
    { p: `Dear ${v.clientName},` },
    { p: `This is a reminder about the hotel booking made for your ${v.country} visa application (reference ${v.reference}). The cancellation date for this booking is ${v.date}.` },
    { p: 'If you do not intend to keep this booking, please make sure it is cancelled by this date to avoid any charges.' },
    { p: 'If you have any questions, please do not hesitate to contact us.' },
  ]);

export const flightCheckInEmail = (v: { clientName: string; reference: string; flightTime: string }): RenderedEmail =>
  render(`Online Check-in Is Now Open — Your Flight on ${v.flightTime} | Ref: ${v.reference}`, [
    { p: `Dear ${v.clientName},` },
    { p: `Online check-in opens 24 hours before departure, so you can now check in for your flight on ${v.flightTime} (UK time).` },
    { p: 'Please check in on your airline\'s website or app, and keep your passport and booking details to hand.' },
    { p: `If you need any help, please contact us quoting reference ${v.reference}.` },
  ]);
