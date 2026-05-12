import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const VALID_ROLES = ["STAFF", "MANAGER", "DIRECTOR"] as const;
type Role = (typeof VALID_ROLES)[number];

async function main() {
  const email = process.argv[2];
  const name = process.argv[3];
  const password = process.argv[4];
  const role = (process.argv[5] ?? "MANAGER") as Role;

  if (!email || !name || !password) {
    console.error(
      'Usage: npx tsx scripts/create-admin.ts <email> "<name>" <password> [ROLE]',
    );
    console.error(`  ROLE: ${VALID_ROLES.join(" | ")} (default: MANAGER)`);
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(
      `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  if (!email.includes("@")) {
    console.error(`Invalid email: ${email}`);
    process.exit(1);
  }

  const db = new PrismaClient();
  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      console.error(
        `User with email ${email} already exists (id: ${existing.id}, role: ${existing.role}). Use scripts/promote.ts to change role.`,
      );
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email,
        name,
        password: passwordHash,
        role,
        createdAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log(`✓ Created ${user.role}: ${user.email} (${user.name})`);
    console.log(`  id: ${user.id}`);
    console.log(`  Login with email + password at /login.`);
  } finally {
    await db.$disconnect();
  }
}

void main();
