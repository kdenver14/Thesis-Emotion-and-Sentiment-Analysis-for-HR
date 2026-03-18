import { getSentimentTrends, getHeatmapData, getTypeBreakdown } from "~/actions/sessions";
import { SentimentLineChart } from "~/components/client/charts/SentimentLineChart";
import { EmotionLineChart } from "~/components/client/charts/EmotionLineChart";
import { ExportButtons } from "~/components/client/ExportButtons";

export default async function AnalyticsPage() {
  const [trends30, trends90, heatmap, typeBreakdown] = await Promise.all([
    getSentimentTrends(30),
    getSentimentTrends(90),
    getHeatmapData(30),
    getTypeBreakdown(),
  ]);

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <ExportButtons aggregateParams={{ from: new Date(Date.now() - 30 * 86400000).toISOString() }} label="Export 30d" />
      </div>

      {/* Sentiment trend — 30 days */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-1 text-sm font-medium text-gray-700">
          Sentiment trend — 30 days
        </h2>
        <SentimentLineChart data={trends30} height={240} />
      </div>

      {/* Sentiment trend — 90 days */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-1 text-sm font-medium text-gray-700">
          Sentiment trend — 90 days
        </h2>
        <SentimentLineChart data={trends90} height={240} />
      </div>

      {/* Emotion trend */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-1 text-sm font-medium text-gray-700">
          Emotion trend (last 30 days)
        </h2>
        <EmotionLineChart data={heatmap} height={240} />
      </div>

      {/* Session type breakdown */}
      {typeBreakdown.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-4">
          <h2 className="mb-4 text-sm font-medium text-gray-700">
            Session type breakdown
          </h2>
          <div className="flex flex-col gap-4">
            {typeBreakdown.map(({ sessionType, sentiments }) => (
              <div key={sessionType}>
                <h3 className="mb-2 text-xs font-medium capitalize text-gray-500">
                  {sessionType.replace(/_/g, " ")}
                </h3>
                <div className="flex gap-4">
                  {Object.entries(sentiments).map(([label, value]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            label === "positive"
                              ? "#22c55e"
                              : label === "negative"
                                ? "#ef4444"
                                : "#6b7280",
                        }}
                      />
                      <span className="text-xs capitalize text-gray-600">
                        {label}: {value}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
