import { useRef, useState, type RefObject } from 'react';
import { TextInput as NativeTextInput, View } from 'react-native';
import type { Section } from '../domain/models';
import { activeSections, sectionColors } from '../domain/sections';
import { resolveSectionIcon } from '../domain/sectionAppearance';
import { useAppData } from '../data/useAppData';
import { useAppTheme } from '../theme/ThemeProvider';
import { AppTextInput } from './AppText';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
import { Label, Muted, Row } from './ui';
import { SectionHeader } from './SectionHeader';
import { SectionIconPicker } from './SectionIconPicker';
import { ProjectHeader, ProjectScope } from './ProjectAppearance';
import { SettingsDialog } from './SettingsDialog';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

export function SectionEditorDialog({ initial, expected, onClose, onSaved, returnFocusRef }: {
  initial: Section; expected?: Section; onClose: () => void; onSaved: () => void;
  returnFocusRef: RefObject<View | null>;
}) {
  const { data, saveSection, reassignSection } = useAppData();
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [icons, setIcons] = useState(false), [manage, setManage] = useState(false);
  const [confirm, setConfirm] = useState<'discard' | Section>();
  const nameRef = useRef<NativeTextInput>(null), pending = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const navigationGuard = useUnsavedChanges(dirty || busy);
  const close = () => { if (!pending.current) { if (confirm) setConfirm(undefined); else if (dirty) setConfirm('discard'); else onClose(); } };
  const run = async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await operation(); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Please retry.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const field = { color: colors.text, backgroundColor: colors.background, minHeight: 48, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border };
  return <><SettingsDialog title={confirm === 'discard' ? 'Discard section changes?' : confirm ? 'Move section contents?' : expected ? 'Edit section' : 'Create section'} onClose={close} onShow={() => nameRef.current?.focus()} returnFocusRef={returnFocusRef}
    footer={<>{error ? <FormError>{error}</FormError> : null}{confirm ? <Row>
      <Action label={confirm === 'discard' ? 'Keep editing section' : 'Cancel reassignment'} disabled={busy} onPress={() => setConfirm(undefined)} />
      <Action label={confirm === 'discard' ? 'Discard section changes' : 'Confirm move contents'} disabled={busy} onPress={() => { if (confirm === 'discard') onClose(); else void run(() => reassignSection(initial.id, confirm.id)); }} />
    </Row> : <Row><Action label="Cancel section edit" text="Cancel" disabled={busy} onPress={close} /><Action label="Save section" text={busy ? 'Saving…' : error ? 'Retry save' : 'Save'} primary disabled={busy} onPress={() => void run(() => saveSection(draft, expected))} /></Row>}</>}>
    {confirm ? <Muted>{confirm === 'discard' ? 'Your saved section will not change. Discard the changes made in this editor?' : `Move all tasks, projects, and recurring tasks from ${initial.name} to ${confirm.name}? Completed and archived work is included. The section itself stays in your list.`}</Muted> : <>
      <Label>Live preview</Label><SectionHeader section={{ ...draft, name: draft.name.trim() || 'Section name' }} summary={draft.archived ? 'Archived' : undefined} />
      <ProjectScope project={{ sectionId: draft.id }} sections={[draft]}><ProjectHeader title="Sample project" summary="2 remaining" /><Row><Action label="Preview primary action" text="Add task" primary onPress={() => undefined} /><Action label="Preview secondary action" text="Edit project" onPress={() => undefined} /></Row></ProjectScope>
      <Label>Name</Label><AppTextInput ref={nameRef} accessibilityLabel="Section name" editable={!busy} value={draft.name} maxLength={60} onChangeText={name => setDraft(d => ({ ...d, name }))} style={field} />
      <Label>Color</Label><AppTextInput accessibilityLabel="Custom section color, six digit hex" editable={!busy} value={draft.color} maxLength={7} autoCapitalize="none" autoCorrect={false} onChangeText={color => setDraft(d => ({ ...d, color }))} style={field} />
      <Muted>Choose a color or enter a six digit hex value. The preview keeps headings readable.</Muted>
      <Row>{sectionColors.map(([name, color]) => <View key={color} style={{ borderLeftWidth: 4, borderLeftColor: color }}><Action label={`Section color ${name}${draft.color === color ? ', selected' : ''}`} text={`${draft.color === color ? '✓ ' : ''}${name}`} disabled={busy} onPress={() => setDraft(d => ({ ...d, color }))} /></View>)}</Row>
      <Action label="Choose section icon" text={`Icon: ${draft.icon === 'none' ? 'No icon' : resolveSectionIcon(draft.icon)?.label ?? 'General'} · ${icons ? 'Hide choices' : 'Change'}`} expanded={icons} disabled={busy} onPress={() => setIcons(!icons)} />
      {icons ? <SectionIconPicker value={draft.icon} color={draft.color} disabled={busy} onChange={icon => setDraft(d => ({ ...d, icon }))} /> : null}
      {expected ? <View style={{ gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Action label="Section management" expanded={manage} disabled={busy} onPress={() => setManage(!manage)} />
        {manage ? <><Muted>Archive keeps all tasks and projects. At least one section must stay active. LifeCommand does not permanently delete sections.</Muted>
          <Action label={`${draft.archived ? 'Restore' : 'Archive'} ${initial.name}`} disabled={busy} onPress={() => setDraft(d => ({ ...d, archived: !d.archived }))} />
          <Muted>Archiving or restoring takes effect when you save. Moving contents is a separate, confirmed action. Save or cancel your edits before moving contents.</Muted>
          {activeSections(data?.sections ?? []).filter(s => s.id !== initial.id).map(target => <Action key={target.id} label={`Move contents to ${target.name}`} disabled={busy || dirty} onPress={() => setConfirm(target)} />)}
        </> : null}
      </View> : null}
    </>}
  </SettingsDialog>{navigationGuard.prompt}</>;
}
