const express = require("express");
const axios = require("axios");
const AppUser = require("../models/AppUser");
const router = express.Router();

/* POST /api/auth/facebook
  
   Exchanging for long-lived token, fetches profile, upserts into DB */
router.post("/facebook", async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    // Exchanging short-lived token for long-lived token
    const tokenResponse = await axios.get(
      "https://graph.facebook.com/v20.0/oauth/access_token",
      {
        params: {
          grant_type: "fb_exchange_token",
          client_id: process.env.FB_APP_ID,
          client_secret: process.env.FB_APP_SECRET,
          fb_exchange_token: accessToken,
        },
      }
    );

    const longLivedToken = tokenResponse.data.access_token;

    // Fetching user profile
    const profileResponse = await axios.get(
      "https://graph.facebook.com/v20.0/me",
      {
        params: {
          fields: "id,name,picture.width(200).height(200)",
          access_token: longLivedToken,
        },
      }
    );

    const { id, name, picture } = profileResponse.data;
    const profilePicture = picture?.data?.url || "";

    // Upserting user in database
    const user = await AppUser.findOneAndUpdate(
      { facebookId: id },
      {
        facebookId: id,
        name,
        profilePicture,
        accessToken: longLivedToken,
      },
      { upsert: true, new: true }
    );

    res.json({
      user: {
        id: user._id,
        facebookId: user.facebookId,
        name: user.name,
        profilePicture: user.profilePicture,
      },
      accessToken: longLivedToken,
    });
  } catch (error) {
    console.error("Facebook auth error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Authentication failed",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
