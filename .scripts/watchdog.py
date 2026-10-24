"""Is rizzo.cc up, and will it still be up next month?

Run by .github/workflows/rizzo-watchdog.yml every six hours. Exits non-zero
on any problem, which fails the workflow, which makes GitHub email the
account that owns the schedule.

Written after 2026-10-24, when the whole domain - including the /reel link
that goes to agents - returned errors for an unknown length of time and
nobody knew. The certificate had quietly failed to renew behind the
Cloudflare proxy, expired, and Cloudflare's strict mode refused to serve the
site without it. All of that was detectable weeks in advance.

Two kinds of check:

  Is it up now?      Each key page answers 200 over valid HTTPS.

  Will it break?     The certificate GitHub serves expires in more than 21
                     days. Let's Encrypt certificates are renewed with about
                     30 days left, so a certificate inside 21 days means the
                     renewal has already failed at least once - which is
                     exactly the warning that would have caught this outage
                     three weeks early.

Stdlib only, no dependencies, no secrets.
"""

import datetime as dt
import socket
import ssl
import sys
import urllib.error
import urllib.request

HOSTS = ["rizzo.cc", "www.rizzo.cc"]

PAGES = [
    "https://rizzo.cc/",
    "https://rizzo.cc/reel",
    "https://rizzo.cc/resources",
    "https://rizzo.cc/blog/",
]

WARN_DAYS = 21
UA = "rizzo-watchdog/1.0 (+https://rizzo.cc/)"

problems = []


def check_certificate(host):
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((host, 443), timeout=20) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as tls:
                cert = tls.getpeercert()
    except ssl.SSLCertVerificationError as exc:
        problems.append(f"{host}: certificate rejected - {exc.verify_message}")
        print(f"  FAIL  {host:16} certificate rejected: {exc.verify_message}")
        return
    except Exception as exc:
        problems.append(f"{host}: could not connect - {exc}")
        print(f"  FAIL  {host:16} could not connect: {exc}")
        return

    expires = dt.datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z")
    days = (expires - dt.datetime.utcnow()).days
    issuer = dict(x[0] for x in cert["issuer"]).get("organizationName", "?")

    if days < WARN_DAYS:
        problems.append(
            f"{host}: certificate expires in {days} days ({expires:%Y-%m-%d}). "
            f"Renewal should have happened by now - it is failing."
        )
        print(f"  WARN  {host:16} expires in {days} days - renewal is failing")
    else:
        print(f"  ok    {host:16} valid, {issuer}, {days} days left")


def check_page(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            code = resp.status
    except urllib.error.HTTPError as exc:
        code = exc.code
    except Exception as exc:
        problems.append(f"{url}: {exc}")
        print(f"  FAIL  {url:32} {exc}")
        return

    if code == 200:
        print(f"  ok    {url:32} 200")
    else:
        problems.append(f"{url}: HTTP {code}")
        print(f"  FAIL  {url:32} HTTP {code}")


def main():
    print("Certificates")
    for host in HOSTS:
        check_certificate(host)

    print("\nPages")
    for url in PAGES:
        check_page(url)

    if problems:
        print("\nPROBLEMS")
        for p in problems:
            print("  -", p)
        print(
            "\nIf this is the certificate: check `gh api repos/yada-yoda/main-rcc/pages`"
            " for https_certificate.state, and confirm the rizzo.cc and www A"
            " records in Cloudflare are DNS-only (grey cloud). GitHub cannot renew"
            " its certificate while they are proxied."
        )
        return 1

    print("\nAll good.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
