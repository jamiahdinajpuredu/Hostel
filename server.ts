import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '5mb' }));

const DATA_FILE = path.join(process.cwd(), 'data.json');

// Helper to read/write data
async function readData() {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(content);
    return { 
      students: data.students || [], 
      attendance: data.attendance || [], 
      users: data.users || [],
      settings: data.settings || { logoUrl: '' }
    };
  } catch (err) {
    return { students: [], attendance: [], users: [], settings: { logoUrl: '' } };
  }
}

// Settings API Routes
app.get("/api/settings", async (req, res) => {
  const data = await readData();
  res.json(data.settings);
});

app.post("/api/settings", async (req, res) => {
  const { logoUrl } = req.body;
  const data = await readData();
  data.settings = { logoUrl };
  await writeData(data);
  res.json({ success: true, settings: data.settings });
});

async function writeData(data: any) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Auth Routes
app.get("/api/users", async (req, res) => {
  const data = await readData();
  const users = data.users.map(({ password, ...u }: any) => u);
  res.json(users);
});

app.post("/api/register", async (req, res) => {
  const { username, password, name, role } = req.body;
  const data = await readData();
  if (data.users.find((u: any) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: "Username already exists" });
  }
  const newUser = { username, password, name, role: role || 'Staff' };
  data.users.push(newUser);
  await writeData(data);
  res.json({ success: true });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const data = await readData();
  const user = data.users.find((u: any) => 
    u.username.toLowerCase() === username.toLowerCase() && 
    u.password === password
  );
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

app.delete("/api/users/:username", async (req, res) => {
  const { username } = req.params;
  const data = await readData();
  const initialCount = data.users.length;
  data.users = data.users.filter((u: any) => u.username !== username);
  if (data.users.length === initialCount) {
    return res.status(404).json({ error: "User not found" });
  }
  await writeData(data);
  res.json({ success: true });
});

// Student API Routes
app.get("/api/students", async (req, res) => {
  const data = await readData();
  res.json(data.students);
});

app.delete("/api/students/:id", async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  data.students = data.students.filter((s: any) => s.studentId !== id);
  await writeData(data);
  res.json({ success: true });
});

app.post("/api/students/bulk", async (req, res) => {
  const { students } = req.body;
  const data = await readData();
  // Merge by ID
  students.forEach((newS: any) => {
    const index = data.students.findIndex((s: any) => s.studentId === newS.studentId);
    if (index > -1) data.students[index] = newS;
    else data.students.push(newS);
  });
  await writeData(data);
  res.json({ success: true, count: students.length });
});

app.get("/api/attendance", async (req, res) => {
  const { date } = req.query;
  const data = await readData();
  if (date) {
    return res.json(data.attendance.filter((a: any) => a.date === date));
  }
  res.json(data.attendance);
});

app.post("/api/attendance", async (req, res) => {
  const { records } = req.body; // Array of { studentId, date, mealType, status }
  const data = await readData();
  
  // Update or add records
  records.forEach((newRecord: any) => {
    const index = data.attendance.findIndex((a: any) => 
      a.studentId === newRecord.studentId && 
      a.date === newRecord.date && 
      a.mealType === newRecord.mealType
    );
    if (index > -1) {
      data.attendance[index] = newRecord;
    } else {
      data.attendance.push(newRecord);
    }
  });

  await writeData(data);
  res.json({ success: true });
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
