import unittest

from lead_classifier import classify_comment, normalize_text


class LeadClassifierTests(unittest.TestCase):
    def test_normalize_text_removes_accents_and_punctuation(self) -> None:
        self.assertEqual(normalize_text("  ¡Qué tal, Móvil!?  "), "que tal movil")

    def test_classify_comment_matches_rules_and_intent(self) -> None:
        result = classify_comment("Quiero portarme y cambiar mi plan")

        self.assertTrue(result["is_lead"])
        self.assertGreaterEqual(int(result["score"]), 8)
        self.assertIn("portabilidad", result["categories"])
        self.assertIn("plan_telefonia", result["categories"])

    def test_classify_comment_marks_noise_without_positive_score(self) -> None:
        result = classify_comment("hola jajaja")

        self.assertFalse(result["is_lead"])
        self.assertEqual(int(result["score"]), -2)
        self.assertEqual(result["categories"], [])


if __name__ == "__main__":
    unittest.main()
