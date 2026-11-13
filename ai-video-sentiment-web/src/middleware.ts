import { auth } from "./server/auth";

// Only "is someone signed in". Role gates live in the pages (/admin pages
// 404 for Staff, /upload sends Directors to the dashboard): middleware runs
// on the Edge runtime, which cannot read the account's current role, and a
// gate on the token's old role would block a just-promoted user.
export default auth((req) => {
  if (!req.auth) {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  matcher: [
    "/",
    "/upload",
    "/dashboard/:path*",
    "/employees/:path*",
    "/admin/:path*",
    "/reports",
    "/set-password",
  ],
};
