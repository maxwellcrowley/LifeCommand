import { Action } from '@/src/components/TaskScheduling';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ProjectProgress } from '@/src/components/ProjectProgress';
import { Card, Label, Muted, Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { projectStatuses } from '@/src/domain/projects';
import { useAppTheme } from '@/src/theme/ThemeProvider';

const headings = { active: 'Active projects', paused: 'Paused projects', complete: 'Completed projects', archived: 'Archived projects' };

export default function ProjectsScreen() {
  const { data } = useAppData();
  const { colors } = useAppTheme();
  const [showArchived, setShowArchived] = useState(false);
  if (!data) return <Page title="Projects" subtitle="Loading your projects…" />;
  const archivedCount = data.projects.filter(project => project.status === 'archived').length;
  return <Page title="Projects" subtitle="Progress across the work that matters.">
    <Pressable accessibilityRole="button" onPress={() => router.push('/project/new')} style={{ minHeight: 44, padding: 15, borderRadius: 12, backgroundColor: colors.accent }}><Text style={{ color: colors.onAccent, fontWeight: '700' }}>Create project</Text></Pressable>
    {!data.projects.length ? <Card title="No projects yet"><Muted>Create your first project, then link tasks from Capture or a task editor to see progress here.</Muted></Card> : null}
    {data.projects.length > 0 && !data.projects.some(project => project.status === 'active') ? <Card title="No active projects"><Muted>Create a project, resume a paused project, or show archived projects and restore one to Active.</Muted></Card> : null}
    {archivedCount ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showArchived }} onPress={() => setShowArchived(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Label>{showArchived ? 'Hide' : 'Show'} archived projects ({archivedCount})</Label></Pressable> : null}
    {projectStatuses.filter(status => status !== 'archived' || showArchived).map(status => {
      const projects = data.projects.filter(project => project.status === status);
      if (!projects.length) return null;
      return <View key={status} style={{ gap: 12 }}><Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>{headings[status]} ({projects.length})</Text>
        {projects.map(project => <Card key={project.id} title={project.name}>
          {project.description ? <Muted>{project.description}</Muted> : null}
          <Muted>{data.sections.find(section => section.id === project.sectionId)?.name ?? 'No section'}</Muted>
          <ProjectProgress project={project} tasks={data.tasks} />
          <Action label={`Edit project: ${project.name}`} text="Edit project and linked tasks" onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })} />
        </Card>)}
      </View>;
    })}
  </Page>;
}
