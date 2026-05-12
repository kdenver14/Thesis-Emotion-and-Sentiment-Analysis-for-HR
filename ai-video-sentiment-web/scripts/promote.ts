import { PrismaClient } from "@prisma/client";

const VALID_ROLES = ["STAFF", "MANAGER", "DIRECTOR"] as const;
type Role = (typeof VALID_ROLES)[number];

async function main() {
  const email = process.argv[2];
  const role = (process.argv[3] ?? "MANAGER") as Role;

  if (!email) {
    console.error("Usage: npx tsx scripts/promote.ts <email> [ROLE]");
    console.error(`  ROLE: ${VALID_ROLES.join(" | ")} (default: MANAGER)`);
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const db = new PrismaClient();
  try {
    const user = await db.user.update({
      where: { email },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log(`✓ ${user.email} (${user.name ?? "no name"}) → ${user.role}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Record to update not found")) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await db.$disconnect();
  }
}

void main();
