import { Inference } from "~/components/client/Inference";
import { getEmployees } from "~/actions/employees";

export default async function HomePage() {
  const employees = await getEmployees();

  return (
    <div className="flex w-full flex-col items-center p-6 sm:p-10">
      <Inference employees={employees} />
    </div>
  );
}
