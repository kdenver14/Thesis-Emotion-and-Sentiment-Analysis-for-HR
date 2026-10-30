// Route-level skeleton shown while the dashboard's server data resolves.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex justify-end">
        <div className="h-9 w-80 max-w-full animate-pulse rounded-md bg-gray-100" />
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
      <div className="h-80 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
    </div>
  );
}
