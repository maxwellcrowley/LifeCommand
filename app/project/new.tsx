import { ProjectEditor } from '@/src/components/ProjectEditor';
import { useAppData } from '@/src/data/useAppData';

export default function NewProjectScreen() {
  const { resetVersion } = useAppData();
  return <ProjectEditor key={resetVersion} />;
}
