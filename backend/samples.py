from __future__ import annotations
import datetime
import os
import plistlib
from typing import Dict, Any


def build_sample_payload() -> Dict[str, Any]:
    """Create a rich, realistic sample plist payload with all plist data types."""
    nested_plist_dict = {
        "EmbeddedConfigVersion": "2.4.1",
        "FeatureFlags": {
            "EnableHardwareAcceleration": True,
            "MaxConcurrentThreads": 16,
            "TelemetryEndpoint": "https://telemetry.example.internal/v2/ingest",
        },
        "SignatureBytes": b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR-SAMPLE-PAYLOAD-BYTES",
    }
    embedded_bplist = plistlib.dumps(nested_plist_dict, fmt=plistlib.FMT_BINARY)

    return {
        "CFBundleIdentifier": "com.antigravity.plistviewer.sample",
        "CFBundleName": "PListViewer Diagnostic Sample",
        "CFBundleShortVersionString": "1.2.0",
        "CFBundleNumericVersion": 10200,
        "LSMinimumSystemVersion": "13.0",
        "UIRequiresFullScreen": False,
        "LastModifiedTimestamp": datetime.datetime(2026, 10, 29, 17, 30, 0),
        "PerformanceMetrics": {
            "StartupLatencyMs": 42.875,
            "MemoryFootprintBytes": 67108864,
            "CacheHitRatio": 0.9642,
        },
        "SupportedArchitectures": ["x86_64", "arm64", "universal2"],
        "RecentEndpoints": [
            {
                "Host": "api.core.internal",
                "Port": 8443,
                "UseTLS": True,
                "CertificateThumbprint": b"\xde\xad\xbe\xef\xca\xfe\xba\xbe\x01\x23\x45\x67\x89\xab\xcd\xef",
            },
            {
                "Host": "fallback.core.internal",
                "Port": 8080,
                "UseTLS": False,
                "CertificateThumbprint": b"\x00\x11\x22\x33\x44\x55\x66\x77\x88\x99\xaa\xbb\xcc\xdd\xee\xff",
            },
        ],
        "RawBinarySessionToken": (
            b"SESSION_TOKEN_HEADER::\x00\x01\x02\x03"
            b"User=admin;Role=ForensicAnalyst;Expires=2027-01-01T00:00:00Z"
            b"\xff\xfe\xfd\xfc"
        ),
        "EmbeddedBinaryPlistData": embedded_bplist,
        "EmbeddedXMLPlistString": plistlib.dumps(
            {"NestedXMLKey": "Hello from embedded XML string", "RetryCount": 3},
            fmt=plistlib.FMT_XML,
        ).decode("utf-8"),
    }


def build_sample_nskeyed_archive() -> Dict[str, Any]:
    """Create a realistic NSKeyedArchiver plist structure with UID references."""
    return {
        "$version": 100000,
        "$archiver": "NSKeyedArchiver",
        "$top": {"root": plistlib.UID(1)},
        "$objects": [
            "$null",
            {
                "$class": plistlib.UID(7),
                "NS.keys": [plistlib.UID(2), plistlib.UID(3), plistlib.UID(4)],
                "NS.objects": [plistlib.UID(5), plistlib.UID(6), plistlib.UID(8)],
            },
            "AccountIdentifier",
            "LastSyncDate",
            "DeviceTokens",
            "acct_9948102_forensic_demo",
            {
                "$class": plistlib.UID(9),
                "NS.time": 815078400.0,  # Seconds since 2001-01-01 UTC
            },
            {
                "$classname": "NSMutableDictionary",
                "$classes": ["NSMutableDictionary", "NSDictionary", "NSObject"],
            },
            {
                "$class": plistlib.UID(12),
                "NS.objects": [plistlib.UID(10), plistlib.UID(11)],
            },
            {
                "$classname": "NSDate",
                "$classes": ["NSDate", "NSObject"],
            },
            b"\xa1\xb2\xc3\xd4\xe5\xf6\x07\x18APNS_DEVICE_TOKEN_PRIMARY",
            "iPadPro-12.9-Simulator",
            {
                "$classname": "NSArray",
                "$classes": ["NSArray", "NSObject"],
            },
        ],
    }


def ensure_sample_files(samples_dir: str) -> Dict[str, str]:
    """Generate sample XML, Binary, and NSKeyedArchiver .plist files on disk."""
    os.makedirs(samples_dir, exist_ok=True)
    payload = build_sample_payload()
    keyed = build_sample_nskeyed_archive()

    xml_path = os.path.join(samples_dir, "sample_xml.plist")
    bin_path = os.path.join(samples_dir, "sample_binary.plist")
    keyed_path = os.path.join(samples_dir, "sample_nskeyed.plist")

    with open(xml_path, "wb") as f:
        f.write(plistlib.dumps(payload, fmt=plistlib.FMT_XML))

    with open(bin_path, "wb") as f:
        f.write(plistlib.dumps(payload, fmt=plistlib.FMT_BINARY))

    with open(keyed_path, "wb") as f:
        f.write(plistlib.dumps(keyed, fmt=plistlib.FMT_BINARY))

    return {
        "xml": xml_path,
        "binary": bin_path,
        "nskeyed": keyed_path,
    }
