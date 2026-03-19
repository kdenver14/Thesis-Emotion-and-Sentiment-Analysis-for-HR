import {
  getDashboardStats,
  getSentimentTrends,
  getHeatmapData,
  getTypeBreakdown,
} from "~/actions/sessions";
import { AnalyticsClient } from "./AnalyticsClient";

export default async function AnalyticsPage() {
  const [trends7, trends30, trends90, emotionTrend, typeBreakdown, stats] =
    await Promise.all([
      getSentimentTrends(7),
      getSentimentTrends(30),
      getSentimentTrends(90),
      getHeatmapData(30),
      getTypeBreakdown(),
      getDashboardStats(),
    ]);

  return (
    <AnalyticsClient
      trends7={trends7}
      trends30={trends30}
      trends90={trends90}
      emotionTrend={emotionTrend}
      typeBreakdown={typeBreakdown}
      stats={stats}
    />
  );
}
