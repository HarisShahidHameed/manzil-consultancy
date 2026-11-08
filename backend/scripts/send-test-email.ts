// Sends the three client emails, filled with made-up data, to one address:
//   npm run email:test -- you@example.com
// Touches no client or case records. It uses the SMTP settings in backend/.env.
import 'dotenv/config';
import { buildMail, EmailCase } from '../src/services/clientEmail.service';
import { mailStatus, sendMail } from '../src/utils/mailer';

const main = async () => {
  const to = process.argv[2];
  if (!to) throw new Error('Pass the address to send to: npm run email:test -- you@example.com');

  const status = mailStatus();
  if (!status.enabled) throw new Error(`Email can't be sent: ${status.reason}`);

  const now = new Date();
  const sample = {
    id: 'sample', stage: 'FILE_PROCESSING', onHold: false, destination: 'France', visaType: 'Tourist',
    receivedDate: now, charges: 500, discount: 50, advance: 100, welcomeEmailEligible: true,
    hotelCancellationDate: now,
    flightDateTime: new Date(now.getTime() + 24 * 60 * 60_000),
    client: {
      clientRef: 'CL-999', firstName: 'Test', lastName: 'Client', email: to,
      addressStreet: '1 Sample Street', addressCity: 'London', addressShire: null,
      addressPostalCode: 'EC1V 2NX', addressCountry: 'United Kingdom',
    },
  } as unknown as EmailCase;

  for (const type of ['WELCOME', 'HOTEL_CANCELLATION', 'FLIGHT_CHECKIN'] as const) {
    await sendMail(await buildMail(type, sample, to, now));
    console.log(`Sent ${type}`);
  }
};

main().then(() => process.exit(0)).catch(e => {
  console.error(e.message);
  process.exit(1);
});
