import { PrismaClient } from "@prisma/client";

async function main() {
  const email = process.argv[2];
  const confirmFlag = process.argv.slice(3).includes("--yes");

  if (!email) {
    console.error("Usage: npx tsx scripts/delete-admin.ts <email> --yes");
    console.error("  Deletes the user with the given email.");
    console.error("  Cascades to: accounts, login sessions, employees, analysis sessions.");
    console.error("  --yes is required (destructive, irreversible).");
    process.exit(1);
  }

  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        _count: {
          select: { analysisSessions: true, employees: true, accounts: true },
        },
      },
    });

    if (!user) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }

    if (user.role === "MANAGER") {
      const managerCount = await db.user.count({ where: { role: "MANAGER" } });
      if (managerCount <= 1) {
        console.error(
          `Refusing to delete ${user.email}: only ${managerCount} MANAGER remains.`,
        );
        console.error(
          "Create another MANAGER first (scripts/create-admin.ts) or promote an existing user (scripts/promote.ts).",
        );
        process.exit(1);
      }
    }

    console.log("Target:");
    console.log(`  email:           ${user.email}`);
    console.log(`  name:            ${user.name ?? "—"}`);
    console.log(`  role:            ${user.role}`);
    console.log(`  id:              ${user.id}`);
    console.log("Cascade will delete:");
    console.log(`  analysisSessions: ${user._count.analysisSessions}`);
    console.log(`  employees:        ${user._count.employees}`);
    console.log(`  accounts:         ${user._count.accounts}`);

    if (!confirmFlag) {
      console.error("\nDry run. Pass --yes to confirm deletion.");
      process.exit(1);
    }

    await db.user.delete({ where: { id: user.id } });
    console.log(`\n✓ Deleted ${user.role}: ${user.email}`);
  } finally {
    await db.$disconnect();
  }
}

void main();
