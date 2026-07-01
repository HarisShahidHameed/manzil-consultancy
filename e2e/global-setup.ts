const BASE = 'http://localhost:5173/api';

const login = async (email: string, password: string): Promise<string> => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  return json.data.accessToken as string;
};

const sampleClients = [
  { firstName: 'Ali', lastName: 'Khan', nationality: 'Pakistani', destination: 'UK', gender: 'MALE', source: 'Referral' },
  { firstName: 'Sara', lastName: 'Ahmed', nationality: 'Indian', destination: 'Canada', gender: 'FEMALE', source: 'Walk-in' },
  { firstName: 'Omar', lastName: 'Farooq', nationality: 'Bangladeshi', destination: 'UK', gender: 'MALE', source: 'Facebook' },
];

export default async function globalSetup(): Promise<void> {
  const token = await login('admin@manzil.com', 'Admin@123456');
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const caseIds: string[] = [];

  for (const [i, c] of sampleClients.entries()) {
    const res = await fetch(`${BASE}/clients`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        receivedDate: '2025-06-15',
        firstName: c.firstName,
        lastName: c.lastName,
        gender: c.gender,
        dob: '1990-01-15',
        phone: `030000000${i}`,
        passportNumber: `E2E${i}99999`,
        passportIssue: '2020-01-01',
        passportExpiry: '2030-01-01',
        nationality: c.nationality,
        source: c.source,
        destination: c.destination,
        priority: 'MEDIUM',
        charges: 1000 + i * 100,
        advance: 100,
      }),
    });
    const json = await res.json();
    const firstCaseId = json?.data?.visaCases?.[0]?.id;
    if (firstCaseId) caseIds.push(firstCaseId);
  }

  if (caseIds[0]) {
    await fetch(`${BASE}/invoices`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ caseId: caseIds[0], charges: 1200, discount: 100, advance: 100 }),
    });
  }
}
