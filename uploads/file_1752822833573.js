const axios = require('axios');
const FormData = require('form-data');
const { fromBuffer } = require('file-type');

/**
 * Upload file ke https://x.filn.xyz/upload.php tanpa pembatasan ekstensi
 * @param {Buffer} buffer File buffer
 * @returns {Promise<string>} URL file
 */
module.exports = async function uploadImage(buffer) {
  const fileInfo = await fromBuffer(buffer);
  if (!fileInfo) {
    throw new Error("Unsupported or unrecognized file type");
  }

  const { ext, mime } = fileInfo;

  const form = new FormData();
  form.append("file", buffer, {
    filename: `file.${ext}`,
    contentType: mime
  });

  try {
    const { data } = await axios.post("https://x.filn.xyz/upload.php", form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (!data || !data.success || !data.url) {
      throw new Error("Upload failed: Invalid response");
    }

    return data.url;
  } catch (err) {
    throw new Error(`Upload error: ${err.message}`);
  }
};