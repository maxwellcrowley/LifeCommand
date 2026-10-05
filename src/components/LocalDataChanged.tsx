import { AppText as Text } from '@/src/components/AppText';
import { Modal, Pressable, ScrollView, View } from 'react-native';

export function LocalDataChanged({ visible, error, onReload }: { visible: boolean; error: string; onReload: () => void }) {
  return <Modal visible={visible} animationType="none" onRequestClose={() => {}}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32, backgroundColor: '#F5F7FA' }}>
      <View style={{ gap: 20, maxWidth: 540, width: '100%', alignSelf: 'center' }}>
        <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '700', color: '#17263C' }}>Local data changed in another tab</Text>
        <Text style={{ fontSize: 18, color: '#17263C' }}>Saving is paused to protect the latest data. Reload to use the saved tasks, projects, events and settings. Unsaved drafts in this tab will be discarded. You can keep your other tabs open.</Text>
        {error ? <Text accessibilityRole="alert" style={{ color: '#9B2424' }}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={onReload} style={{ minHeight: 48, padding: 16, backgroundColor: '#254F86', borderRadius: 12 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>Reload local data</Text>
        </Pressable>
      </View>
    </ScrollView>
  </Modal>;
}
