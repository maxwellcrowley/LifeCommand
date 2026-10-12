import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAppData } from '../data/useAppData';
import { useAppTheme } from '../theme/ThemeProvider';
import { sectionColors } from '../domain/sections';
import type { Section } from '../domain/models';
import { Card, Label, Muted, Row } from './ui';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
import { SectionHeader } from './SectionHeader';
import { SectionEditorDialog } from './SectionEditorDialog';

export function SectionSettings() {
  const { data, moveSection } = useAppData();
  const { colors } = useAppTheme();
  const [editor, setEditor] = useState<{ initial: Section; expected?: Section }>();
  const [reorder, setReorder] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const trigger = useRef<View | null>(null), triggers = useRef(new Map<string, View>()), pending = useRef(false);
  if (!data) return null;
  const sections = [...data.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const move = async (id: string, direction: -1 | 1) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await moveSection(id, direction); setMessage('Section order saved.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reorder. Please retry.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const button = { minHeight: 44, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' as const };
  return <Card title="Personal sections">
    <Muted>Sections follow your account. Edit their name, color, and icon, or manage archived sections.</Muted>
    {sections.map((section, index) => <View key={section.id} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}><SectionHeader section={section} summary={section.archived ? 'Archived' : undefined} /></View>
        <Pressable ref={node => { if (node) triggers.current.set(section.id, node); else triggers.current.delete(section.id); }} accessibilityRole="button" accessibilityLabel={`Edit section ${section.name}`} disabled={busy} style={button} onPress={() => { trigger.current = triggers.current.get(section.id) ?? null; setMessage(''); setEditor({ initial: { ...section }, expected: section }); }}><Label>Edit</Label></Pressable>
      </View>
      {reorder ? <Row><Action label={`Move ${section.name} up`} text="Up" disabled={busy || index === 0} onPress={() => void move(section.id, -1)} /><Action label={`Move ${section.name} down`} text="Down" disabled={busy || index === sections.length - 1} onPress={() => void move(section.id, 1)} /></Row> : null}
    </View>)}
    <Row><Pressable ref={node => { if (node) triggers.current.set('create', node); }} accessibilityRole="button" accessibilityLabel="Create section" disabled={busy} style={button} onPress={() => { trigger.current = triggers.current.get('create') ?? null; setMessage(''); setEditor({ initial: { id: `section-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', color: sectionColors[0][1], order: data.sections.length } }); }}><Label>Add section</Label></Pressable>
      <Action label="Reorder sections" text={reorder ? 'Done reordering' : 'Reorder'} expanded={reorder} onPress={() => setReorder(!reorder)} disabled={busy} />
    </Row>
    {message ? <View accessibilityLiveRegion="polite"><Label>{message}</Label></View> : null}{error ? <FormError>{error}</FormError> : null}
    {editor ? <SectionEditorDialog initial={editor.initial} expected={editor.expected} returnFocusRef={trigger} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); setMessage('Saved.'); }} /> : null}
  </Card>;
}
