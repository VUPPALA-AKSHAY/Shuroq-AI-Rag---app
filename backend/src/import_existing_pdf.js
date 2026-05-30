import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: "c:/Users/Akshay/Desktop/CHATB/backend/.env" });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const desktopPath = "C:/Users/Akshay/Desktop/PatientConsent-UserManual.pdf";
  const uploadsDir = "c:/Users/Akshay/Desktop/CHATB/backend/uploads";

  if (!fs.existsSync(desktopPath)) {
    console.error("PDF not found on Desktop");
    return;
  }

  try {

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `${Date.now()}-PatientConsent-UserManual.pdf`;
    const destPath = path.join(uploadsDir, filename);
    fs.copyFileSync(desktopPath, destPath);
    console.log(`Copied PDF to ${destPath}`);

    const { data: files, error: findError } = await supabase
      .from("files")
      .select("*")
      .eq("name", "PatientConsent-UserManual.pdf");

    if (findError) throw findError;

    if (files.length === 0) {
      console.log("No file record found in DB for PatientConsent-UserManual.pdf");
      return;
    }

    const file = files[0];
    const metadata = file.metadata || {};
    metadata.url = `http://localhost:8080/uploads/${filename}`;

    const { data: updated, error: updateError } = await supabase
      .from("files")
      .update({
        storage_path: destPath,
        metadata
      })
      .eq("id", file.id)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log("Successfully updated database record with URL:", updated.metadata?.url);
  } catch (err) {
    console.error("Migration error:", err);
  }
}

run();
