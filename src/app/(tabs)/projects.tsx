import { AppText as Text } from '@/src/components/AppText';
import { useDevicePreferences } from '@/src/data/DevicePreferences';
import { Action } from '@/src/components/TaskScheduling';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ProjectProgress } from '@/src/components/ProjectProgress';
import { ProjectNextStep } from '@/src/components/ProjectNextStep';
import { ProjectScope, ProjectHeader } from '@/src/components/ProjectAppearance';
import { SectionHeader } from '@/src/components/SectionHeader';
import { Card, Label, Muted, Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { groupProjectsByStatus, projectStatusLabels } from '@/src/domain/projects';
import { localDateKey } from '@/src/domain/dates';
import { useLocalClock } from '@/src/hooks/useLocalClock';
import { useAppTheme } from '@/src/theme/ThemeProvider';

export default function ProjectsScreen() {
  const { data } = useAppData();
  const { colors } = useAppTheme();
  const [showArchived, setShowArchived] = useState(false);
  const { preferences, save } = useDevicePreferences();
  const now = useLocalClock();
  const collapsed = preferences.collapsed;
  if (!data) return <Page title="Projects" subtitle="Loading your projects…" />;
  const today = now ? localDateKey(now) : localDateKey(new Date());
  const archivedCount = data.projects.filter(project => project.status === 'archived').length;
  return <Page title="Projects" subtitle="Progress across the work that matters.">
    <Pressable accessibilityRole="button" onPress={() => router.push('/project/new')} style={{ minHeight: 44, padding: 15, borderRadius: 12, backgroundColor: colors.accent }}><Text style={{ color: colors.onAccent, fontWeight: '700' }}>Create project</Text></Pressable>
    {!data.projects.length ? <Card title="No projects yet"><Muted>Create your first project, then link tasks from Capture or a task editor to see progress here.</Muted></Card> : null}
    {data.projects.length > 0 && !data.projects.some(project => project.status === 'active') ? <Card title="No active projects"><Muted>Create a project, resume a paused project, or show archived projects and restore one to Active.</Muted></Card> : null}
    {archivedCount ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showArchived }} onPress={() => setShowArchived(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Label>{showArchived ? 'Hide' : 'Show'} archived projects ({archivedCount})</Label></Pressable> : null}
    {groupProjectsByStatus(data, showArchived).map(({ status, projects }) => {
      const expanded = !(collapsed['status:' + status] ?? false);
      return <View key={status} testID={`project-status-${status}`} style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${projectStatusLabels[status]}, ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
          accessibilityHint={expanded ? 'Collapse projects' : 'Expand projects'} accessibilityState={{ expanded }} aria-expanded={expanded}
          onPress={() => void save({ collapsed: { ['status:' + status]: expanded } }).catch(() => undefined)}
          style={({ pressed }) => ({ minHeight: 44, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
          <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 15, flex: 1, minWidth: 0 }}>{projectStatusLabels[status]} · {projects.length}</Text>
          <Text style={{ color: colors.muted, fontSize: 18 }}>{expanded ? '⌄' : '›'}</Text>
        </Pressable>
        {expanded ? projects.map(project => <ProjectScope key={project.id} project={project} sections={data.sections}><Card><ProjectHeader title={project.name} />
          <Muted>{projectStatusLabels[project.status]}</Muted>
          {project.description ? <Muted>{project.description}</Muted> : null}
          {(() => { const section = data.sections.find(item => item.id === project.sectionId); return section ? <SectionHeader section={section} /> : <Muted>No section</Muted>; })()}
          <ProjectProgress project={project} tasks={data.tasks} />
          <ProjectNextStep project={project} today={today} />
          <Action label={`Edit project: ${project.name}`} text="Edit project and linked tasks" onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })} />
        </Card></ProjectScope>) : null}
      </View>;
    })}
  </Page>;
}
