import { getEmployees } from "~/actions/employees";
import { getSessions } from "~/actions/sessions";
import { CandidatesClient, type CandidateRow } from "./CandidatesClient";

export default async function EmployeesPage() {
  const [employees, sessions] = await Promise.all([
    getEmployees(),
    getSessions(),
  ]);

  const candidates: CandidateRow[] = employees.map((emp) => {
    const empSessions = sessions.filter((s) => s.employeeId === emp.id);

    if (empSessions.length === 0) {
      return {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        department: emp.department,
        sessionCount: 0,
        avgScore: null,
        lastDateISO: null,
        status: "pending",
      };
    }

    const avgScore = Math.round(
      empSessions.reduce((sum, s) => sum + s.engagementScore, 0) /
        empSessions.length,
    );

    const lastDate = empSessions.reduce((latest, s) =>
      s.sessionDate > latest.sessionDate ? s : latest,
    ).sessionDate;

    return {
      id: emp.id,
      name: emp.name,
      email: emp.email,
      department: emp.department,
      sessionCount: empSessions.length,
      avgScore,
      lastDateISO: lastDate.toISOString(),
      status: avgScore < 40 ? "review" : "active",
    };
  });

  return (
    <div className="flex flex-col gap-6 p-6 sm:p-8">
      <CandidatesClient candidates={candidates} />
    </div>
  );
}
