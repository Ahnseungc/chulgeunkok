import MyAttendanceScreen from '@/features/attendance/ui/MyAttendanceScreen';

interface MyAttendancePageProps {
  params: Promise<{ attendanceId: string }>;
}

export default async function MyAttendancePage({ params }: MyAttendancePageProps) {
  const { attendanceId } = await params;
  return <MyAttendanceScreen attendanceId={attendanceId} />;
}
