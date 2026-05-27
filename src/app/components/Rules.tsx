import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { mockRules } from '../data/mockData';
import { useState } from 'react';

export function Rules() {
  const [rules, setRules] = useState(mockRules);
  const [newCategory, setNewCategory] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newScore, setNewScore] = useState('1');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editScore, setEditScore] = useState('1');

  const toggleRule = (id: string) => {
    setRules(
      rules.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  };

  const parseKeywords = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const addRule = () => {
    const keywords = parseKeywords(newKeywords);
    const score = Number(newScore);

    if (!newCategory.trim() || keywords.length === 0 || Number.isNaN(score)) {
      return;
    }

    setRules([
      ...rules,
      {
        id: `rule-${Date.now()}`,
        category: newCategory.trim(),
        keywords,
        score,
        enabled: true,
      },
    ]);

    setNewCategory('');
    setNewKeywords('');
    setNewScore('1');
  };

  const startEditing = (id: string) => {
    const rule = rules.find((item) => item.id === id);
    if (!rule) return;

    setEditingRuleId(rule.id);
    setEditCategory(rule.category);
    setEditKeywords(rule.keywords.join(', '));
    setEditScore(String(rule.score));
  };

  const saveEditing = () => {
    if (!editingRuleId) return;

    const keywords = parseKeywords(editKeywords);
    const score = Number(editScore);

    if (!editCategory.trim() || keywords.length === 0 || Number.isNaN(score)) {
      return;
    }

    setRules(
      rules.map((rule) =>
        rule.id === editingRuleId
          ? {
              ...rule,
              category: editCategory.trim(),
              keywords,
              score,
            }
          : rule
      )
    );

    setEditingRuleId(null);
  };

  const deleteRule = (id: string) => {
    setRules(rules.filter((rule) => rule.id !== id));
    if (editingRuleId === id) {
      setEditingRuleId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Reglas de detección
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configura reglas por palabras clave para puntuar y categorizar leads
          </p>
        </div>
        <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={addRule}>
          <Plus className="w-4 h-4" />
          Agregar regla
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              placeholder="Categoría (ej: Roaming)"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
            />
            <Input
              placeholder="Palabras clave separadas por coma"
              value={newKeywords}
              onChange={(event) => setNewKeywords(event.target.value)}
            />
            <Input
              type="number"
              min={0}
              placeholder="Puntaje"
              value={newScore}
              onChange={(event) => setNewScore(event.target.value)}
            />
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={addRule}>
              Guardar nueva regla
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Settings2 className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm text-blue-900 font-medium">
                Cómo funcionan las reglas
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Los mensajes se analizan en tiempo real. Cuando coinciden
                palabras clave, se suma el puntaje correspondiente y se asignan
                categorías. El puntaje total ayuda a priorizar leads.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {rules.map((rule) => {
          const categoryColors: Record<string, string> = {
            Portabilidad: 'bg-purple-50 border-purple-200',
            Condición: 'bg-blue-50 border-blue-200',
            Equipo: 'bg-green-50 border-green-200',
            Plan: 'bg-amber-50 border-amber-200',
            Precio: 'bg-red-50 border-red-200',
          };

          const categoryTextColors: Record<string, string> = {
            Portabilidad: 'text-purple-700',
            Condición: 'text-blue-700',
            Equipo: 'text-green-700',
            Plan: 'text-amber-700',
            Precio: 'text-red-700',
          };

          return (
            <Card
              key={rule.id}
              className={`${
                !rule.enabled ? 'opacity-60' : ''
              } ${categoryColors[rule.category] ?? 'bg-gray-50 border-gray-200'}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle
                      className={`${categoryTextColors[rule.category] ?? 'text-gray-700'} flex items-center gap-2`}
                    >
                      {rule.category}
                      <Badge
                        variant="outline"
                        className="bg-white text-gray-700 border-gray-300"
                      >
                        +{rule.score} puntos
                      </Badge>
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule.id)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-2">
                      Palabras clave
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {rule.keywords.map((keyword, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="bg-white text-gray-700 border border-gray-300"
                        >
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-200/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">
                        Estado: {rule.enabled ? 'Activa' : 'Desactivada'}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => startEditing(rule.id)}
                        >
                          <Settings2 className="w-3 h-3" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteRule(rule.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </div>

                  {editingRuleId === rule.id && (
                    <div className="pt-3 border-t border-gray-200/50 space-y-2">
                      <Input
                        value={editCategory}
                        onChange={(event) => setEditCategory(event.target.value)}
                        placeholder="Categoría"
                      />
                      <Input
                        value={editKeywords}
                        onChange={(event) => setEditKeywords(event.target.value)}
                        placeholder="Palabras clave separadas por coma"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={editScore}
                        onChange={(event) => setEditScore(event.target.value)}
                        placeholder="Puntaje"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={saveEditing}>
                          Guardar cambios
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingRuleId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Example Section */}
      <Card>
        <CardHeader>
          <CardTitle>Ejemplo de scoring</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-900 mb-2">
                Mensaje: "tienen iphone en plan?"
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700">
                    Equipo (+1)
                  </Badge>
                  <span className="text-xs">Coincide: "iphone"</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-amber-50 text-amber-700">
                    Plan (+1)
                  </Badge>
                  <span className="text-xs">Coincide: "plan"</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-gray-900 text-white">
                    Total: 2
                  </Badge>
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm font-medium text-gray-900 mb-2">
                Mensaje: "que pasa si tengo plan vigente pero quiero cambiarme?"
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">
                    Condición (+2)
                  </Badge>
                  <span className="text-xs">Coincide: "que pasa si", "tengo plan"</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-50 text-purple-700">
                    Portabilidad (+2)
                  </Badge>
                  <span className="text-xs">Coincide: "cambiarme"</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-gray-900 text-white">
                    Total: 4
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
