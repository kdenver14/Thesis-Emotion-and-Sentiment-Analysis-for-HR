import { auth } from "./server/auth";

export default auth((req) => {
  const isAuthenticated = !!req.auth;

  if (!isAuthenticated) {
    const newUrl = new URL("/login", req.nextUrl.origin);
    return Response.redirect(newUrl);
  }

  // Redirect DIRECTOR away from upload home page
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (req.auth?.user as any)?.role ?? "STAFF";
  if (role === "DIRECTOR" && req.nextUrl.pathname === "/") {
    return Response.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  // Gate /admin/* to MANAGER and DIRECTOR only
  if (req.nextUrl.pathname.startsWith("/admin") && role !== "MANAGER" && role !== "DIRECTOR") {
    return new Response(null, { status: 404 });
  }
});

export const config = {
  matcher: ["/", "/dashboard/:path*", "/employees/:path*", "/admin/:path*"],
};
