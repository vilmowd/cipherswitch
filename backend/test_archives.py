import base64
import unittest

import archives


def _file(name: str, data: bytes):
    return type("F", (), {"name": name, "data": base64.b64encode(data).decode()})()


class ArchiveTests(unittest.TestCase):
    def test_zip_and_rar_are_kept(self):
        files = archives.normalize_files(
            [
                _file("notes.zip", b"PK\x03\x04hello"),
                _file("notes.rar", b"Rar!\x1a\x07\x01\x00"),
            ]
        )
        self.assertEqual([item["name"] for item in files], ["notes.zip", "notes.rar"])

    def test_other_bytes_are_rejected(self):
        with self.assertRaises(archives.ArchiveError):
            archives.normalize_files([_file("notes.zip", b"MZ not an archive")])

    def test_wrong_extension_is_rejected(self):
        with self.assertRaises(archives.ArchiveError):
            archives.normalize_files([_file("notes.exe", b"PK\x03\x04hello")])


if __name__ == "__main__":
    unittest.main()
