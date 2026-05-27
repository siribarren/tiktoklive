import unittest

from lead_classifier import classify_comment, normalize_text
from main import normalize_unique_id


class CoreUtilsTests(unittest.TestCase):
    def test_normalize_text_removes_accents_and_punctuation(self) -> None:
        self.assertEqual(normalize_text("  ¡Holá, Móvil!!  "), "hola movil")

    def test_classify_comment_keeps_rule_based_scoring(self) -> None:
        result = classify_comment("Quiero portabilidad de mi numero y un plan")
        self.assertEqual(result["score"], 10)
        self.assertTrue(result["is_lead"])
        self.assertIn("portabilidad", result["categories"])
        self.assertIn("plan_telefonia", result["categories"])
        self.assertIn("intencion:quiero", result["reasons"])

    def test_normalize_unique_id_supports_profile_url(self) -> None:
        self.assertEqual(
            normalize_unique_id("https://www.tiktok.com/@CuentaDemo/"),
            "@CuentaDemo",
        )


if __name__ == "__main__":
    unittest.main()
