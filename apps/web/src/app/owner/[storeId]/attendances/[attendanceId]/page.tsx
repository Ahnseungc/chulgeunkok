import AttendanceDetailScreen from '@/features/attendance/ui/AttendanceDetailScreen';

interface AttendanceDetailPageProps {
  params: Promise<{ storeId: string; attendanceId: string }>;
}

export default async function AttendanceDetailPage({ params }: AttendanceDetailPageProps) {
  const { storeId, attendanceId } = await params;
  return <AttendanceDetailScreen storeId={storeId} attendanceId={attendanceId} />;
}
