import { prisma } from "./db.js";

const MASK_SUFFIX = ".ct.vtex.com.br";

function extractCandidate(email: string) {
  if (!email.endsWith(MASK_SUFFIX)) return null;
  const match = email.match(/^([^\\s-]+@[^\\s-]+)-.+\\.ct\\.vtex\\.com\\.br$/i);
  return match ? match[1] : null;
}

async function main() {
  const customers = await prisma.customer.findMany({
    where: { email: { endsWith: MASK_SUFFIX } },
    select: { id: true, email: true }
  });

  const results = customers.map((customer) => ({
    id: customer.id,
    maskedEmail: customer.email,
    candidateEmail: customer.email ? extractCandidate(customer.email) : null
  }));

  const output = {
    total: results.length,
    generatedAt: new Date().toISOString(),
    items: results
  };

  const fs = await import("node:fs");
  fs.writeFileSync("masked-emails.json", JSON.stringify(output, null, 2));
  console.log(`Saved ${results.length} rows to masked-emails.json`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
