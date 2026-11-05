import { ApiHealthCheck } from '../../src/components/ApiHealthCheck';
import { PlaceholderScreen } from '../../src/components/PlaceholderScreen';
import { apiBaseUrl } from '../../src/config';

export default function StatsScreen() {
  return (
    <PlaceholderScreen title="Thống kê" description="Chi tiêu và báo cáo sẽ xuất hiện tại đây.">
      <ApiHealthCheck baseUrl={apiBaseUrl} />
    </PlaceholderScreen>
  );
}
