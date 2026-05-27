import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';

interface AiReviewPanelsProps {
  summaryText: string;
  recommendations: string[];
  notesStorageKey: string;
}

export function AiReviewPanels({
  summaryText,
  recommendations,
  notesStorageKey,
}: AiReviewPanelsProps) {
  const [reviewerNotes, setReviewerNotes] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.localStorage.getItem(notesStorageKey) ?? '';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(notesStorageKey, reviewerNotes);
  }, [notesStorageKey, reviewerNotes]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Resumen generado por IA</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            value={summaryText}
            className="min-h-28 text-sm text-gray-700 leading-relaxed"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recomendaciones y notas del revisor / supervisor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-2">Recomendaciones</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
              {recommendations.map((recommendation, index) => (
                <li key={`${notesStorageKey}-rec-${index}`}>{recommendation}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900 mb-2">Notas del revisor / supervisor</p>
            <Textarea
              value={reviewerNotes}
              onChange={(event) => setReviewerNotes(event.target.value)}
              placeholder="Escribe observaciones, acuerdos y próximos pasos."
              className="min-h-28"
            />
            <p className="mt-2 text-xs text-gray-500">
              Estas notas se guardan localmente en este navegador.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
