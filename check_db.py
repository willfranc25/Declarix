import requests
import json

service_key = "eyJhbG...V2T8"
base_url = "https://urqgygbejabyukzdjdal.supabase.co/rest/v1/"

headers = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json"
}

tables = ['invoices', 'mappings', 'templates', 'settings']

print("=== TABLES ===")
for table in tables:
    try:
        r = requests.get(f"{base_url}{table}?select=*&limit=1", headers=headers, timeout=10)
        print(f"{table}: HTTP {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            if data:
                print(f"  Columns: {list(data[0].keys())}")
            else:
                print(f"  (empty table)")
    except Exception as e:
        print(f"{table}: ERROR - {e}")

# Check storage buckets
try:
    r = requests.get("https://urqgygbejabyukzdjdal.supabase.co/storage/v1/bucket", headers=headers, timeout=10)
    print(f"\nStorage buckets: HTTP {r.status_code}")
    if r.status_code == 200:
        for b in r.json():
            print(f"  - {b['name']} (public: {b['public']})")
except Exception as e:
    print(f"Storage: ERROR - {e}")

# Check functions via rpc
try:
    r = requests.post(
        "https://urqgygbejabyukzdjdal.supabase.co/rest/v1/rpc/get_invoice_changes_since",
        headers=headers,
        json={"p_user_id": "00000000-0000-0000-0000-000000000000", "p_since": "2020-01-01"},
        timeout=10
    )
    print(f"\nFunction get_invoice_changes_since: HTTP {r.status_code}")
except Exception as e:
    print(f"\nFunction get_invoice_changes_since: ERROR - {e}")

try:
    r = requests.post(
        "https://urqgygbejabyukzdjdal.supabase.co/rest/v1/rpc/upsert_invoice_sync",
        headers=headers,
        json={},
        timeout=10
    )
    print(f"Function upsert_invoice_sync: HTTP {r.status_code}")
except Exception as e:
    print(f"Function upsert_invoice_sync: ERROR - {e}")