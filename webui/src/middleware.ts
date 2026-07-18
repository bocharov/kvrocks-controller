import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Proxy /api/v1/* to the controller API, FOLLOWING the controller's leader redirect server-side.
//
// RedirectIfNotLeader makes a non-leader controller 307-redirect API requests to the leader's
// advertised address — an in-cluster pod address that this server can reach but a browser cannot.
// The previous NextResponse.rewrite passed that 307 straight back to the client, so behind an HA
// (multi-replica) controller the UI's API calls failed whenever they landed on a follower. Doing the
// request here with fetch(redirect: "follow") resolves the leader server-side, so the browser only
// ever sees the final response.
export async function middleware(req: NextRequest) {
    if (!req.nextUrl.pathname.startsWith("/api/v1")) {
        return NextResponse.next();
    }

    const host = process.env.KVCTL_API_HOST || "localhost:9379";
    const target = `http://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;

    const headers = new Headers(req.headers);
    headers.delete("host"); // let fetch set Host for the target

    const init: RequestInit = { method: req.method, headers, redirect: "follow" };
    if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = await req.arrayBuffer();
    }

    const upstream = await fetch(target, init);

    // Strip hop-by-hop / length headers the runtime will recompute for the streamed body.
    const respHeaders = new Headers(upstream.headers);
    respHeaders.delete("content-encoding");
    respHeaders.delete("content-length");
    respHeaders.delete("transfer-encoding");

    return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: respHeaders,
    });
}

export const config = {
    matcher: "/api/v1/:path*",
    runtime: "nodejs",
};
