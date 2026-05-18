# create

npx tsx scripts/create-admin.ts blastasia.hr+john@gmail.com "John HR Manager" 'adminsadmins' MANAGER

# promote (email must already exist)

npx tsx scripts/promote.ts blastasia.hr+denver@gmail.com MANAGER

# delete

npx tsx scripts/delete-admin.ts blastasia.hr+john@gmail.com --yes
