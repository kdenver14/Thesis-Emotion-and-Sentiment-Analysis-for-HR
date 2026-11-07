// Shared skeleton for every tab without its own loading.tsx. Clicking a tab
// shows this at once instead of waiting on the server, and in production it
// is what Next prefetches for these dynamic routes.
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8" aria-busy="true">
      <div className="h-7 w-48 animate-pulse rounded-md bg-gray-100" />
      <div className="h-80 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
    </div>
  );
}
