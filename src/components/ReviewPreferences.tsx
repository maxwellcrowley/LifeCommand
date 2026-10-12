import { useState } from 'react';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useAppData } from '../data/useAppData';
import { reviewNames } from '../domain/review';
import { presentationDefaults } from '../domain/presentation';
import { Action } from './Action';
import { Card, Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';
export function ReviewPreferences() {
  const { preferences: p, save } = useDevicePreferences(), { data } = useAppData();
  const [error, setError] = useState('');
  const change = (patch: Parameters<typeof save>[0]) => { setError(''); void save(patch).catch(() => setError('Could not save Review preferences. Retry.')); };
  return <Card title="Review groups"><Muted>Choose what to review and in what order. Tasks appear once, in the first matching enabled group.</Muted>
    {([...p.reviewGroups, ...Object.keys(reviewNames).filter(k => !p.reviewGroups.includes(k as keyof typeof reviewNames))] as (keyof typeof reviewNames)[]).map(group => <Row key={group}><Label>{reviewNames[group]}</Label><Action label={`${p.reviewGroups.includes(group) ? 'Hide' : 'Show'} Review ${reviewNames[group]}`} onPress={() => change({ reviewGroups: p.reviewGroups.includes(group) ? p.reviewGroups.filter(g => g !== group) : [...p.reviewGroups, group] })} />{p.reviewGroups.indexOf(group) > 0 ? <Action label={`Move ${reviewNames[group]} earlier`} onPress={() => { const groups = [...p.reviewGroups], index = groups.indexOf(group); [groups[index - 1], groups[index]] = [groups[index], groups[index - 1]]; change({ reviewGroups: groups }); }} /> : null}</Row>)}
    <Label>Postponement threshold: {p.reviewPostponedThreshold}</Label><Row>{[1, 2, 3, 5, 10].map(n => <Action key={n} label={`Review threshold ${n}${p.reviewPostponedThreshold === n ? ', selected' : ''}`} text={`${n}`} onPress={() => change({ reviewPostponedThreshold: n })} />)}</Row>
    <Row>{(['manual', 'rollover', 'either'] as const).map(source => <Action key={source} label={`Review postponement source ${source}${p.reviewPostponedSource === source ? ', selected' : ''}`} text={source} onPress={() => change({ reviewPostponedSource: source })} />)}</Row>
    <Muted>New counters track actual actions from this version onward and reset on completion. Older lifetime counters cannot tell us what happened since completion, so they are not used.</Muted>
    <Label>Keep sections out of Needs a date</Label><Row>{data?.sections.map(s => <Action key={s.id} label={`${p.reviewBacklogExcludedSections.includes(s.id) ? 'Include' : 'Exclude'} ${s.name} in Needs a date`} onPress={() => change({ reviewBacklogExcludedSections: p.reviewBacklogExcludedSections.includes(s.id) ? p.reviewBacklogExcludedSections.filter(id => id !== s.id) : [...p.reviewBacklogExcludedSections, s.id] })} />)}</Row>
    <Action label="Reset Review preferences" onPress={() => change({ reviewGroups: presentationDefaults.reviewGroups, reviewPostponedThreshold: 3, reviewPostponedSource: 'manual', reviewBacklogExcludedSections: [] })} />{error ? <FormError>{error}</FormError> : null}
  </Card>;
}
