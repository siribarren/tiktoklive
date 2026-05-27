import unittest

from main import normalize_unique_id


class MainNormalizeUniqueIdTests(unittest.TestCase):
    def test_normalize_unique_id_from_plain_value(self) -> None:
        self.assertEqual(normalize_unique_id(" user_name "), "@user_name")

    def test_normalize_unique_id_from_tiktok_url(self) -> None:
        self.assertEqual(
            normalize_unique_id("https://www.tiktok.com/@miCuentaOficial/video/123"),
            "@miCuentaOficial",
        )

    def test_normalize_unique_id_raises_for_empty_value(self) -> None:
        with self.assertRaises(ValueError):
            normalize_unique_id("   ")


if __name__ == "__main__":
    unittest.main()
