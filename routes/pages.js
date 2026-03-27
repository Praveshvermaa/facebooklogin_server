const express = require("express");
const axios = require("axios");
const router = express.Router();

/* GET /api/pages?accessToken=...
   Fetching list of pages managed by the user */
router.get("/", async (req, res) => {
  try {
    const { accessToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    const response = await axios.get(
      "https://graph.facebook.com/v20.0/me/accounts",
      {
        params: {
          access_token: accessToken,
          fields: "id,name,access_token,category",
        },
      }
    );

    res.json({ pages: response.data.data || [] });
  } catch (error) {
    console.error("Pages fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch pages",
      details: error.response?.data || error.message,
    });
  }
});

/* GET /api/pages/:pageId/insights?accessToken=...&since=...&until=...
   Fetching page insights using 'day' period */
router.get("/:pageId/insights", async (req, res) => {
  try {
    const { pageId } = req.params;
    const { accessToken } = req.query;
    let { since, until } = req.query;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    // Default to last 30 days if no date range provided
    if (!since || !until) {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);
      since = since || thirtyDaysAgo.toISOString().split("T")[0];
      until = until || now.toISOString().split("T")[0];
    }

    // Fetching metrics separately since page_fans only supports 'day' period
    const insights = {};

    // Fetching  page_fans (total followers) — uses 'day' period
    try {
      const fansRes = await axios.get(
        `https://graph.facebook.com/v20.0/${pageId}/insights`,
        {
          params: {
            metric: "page_fans",
            access_token: accessToken,
            period: "day",
            since,
            until,
          },
        }
      );
      const fansData = fansRes.data.data?.[0]?.values;
      insights.totalFollowers = fansData?.length > 0
        ? fansData[fansData.length - 1].value
        : 0;
    } catch (e) {
      console.error("page_fans error:", e.response?.data?.error?.message || e.message);
      insights.totalFollowers = "N/A";
    }

    // Fetching engagement metrics — uses 'day' period and sums values
    const engagementMetrics = [
      "page_post_engagements",
      "page_impressions",
      "page_actions_post_reactions_total",
    ];

    try {
      const engRes = await axios.get(
        `https://graph.facebook.com/v20.0/${pageId}/insights`,
        {
          params: {
            metric: engagementMetrics.join(","),
            access_token: accessToken,
            period: "day",
            since,
            until,
          },
        }
      );

      (engRes.data.data || []).forEach((item) => {
        // Summing all daily values for the period
        const total = (item.values || []).reduce((sum, v) => {
          const val = typeof v.value === "object"
            ? Object.values(v.value).reduce((a, b) => a + b, 0)
            : v.value;
          return sum + val;
        }, 0);

        switch (item.name) {
          case "page_post_engagements":
            insights.totalEngagement = total;
            break;
          case "page_impressions":
            insights.totalImpressions = total;
            break;
          case "page_actions_post_reactions_total":
            insights.totalReactions = total;
            break;
        }
      });
    } catch (e) {
      console.error("Engagement metrics error:", e.response?.data?.error?.message || e.message);
      insights.totalEngagement = insights.totalEngagement || "N/A";
      insights.totalImpressions = insights.totalImpressions || "N/A";
      insights.totalReactions = insights.totalReactions || "N/A";
    }

    res.json({ insights });
  } catch (error) {
    console.error("Insights error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch insights",
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

module.exports = router;
