"use client";

import { useState } from "react";
import Card from "./components/Card";

export default function Home() {
  const [roomCode, setRoomCode] = useState("");

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-neutral-900 to-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-10">
        <div className="w-24" /> {/* Spacer for centering */}
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Takedown
        </h1>
        <div className="w-24 flex justify-end">
          <button className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-gray-200 transition-colors">
            Login
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center px-6 py-12 md:py-20">
        {/* Room Cards */}
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl mb-10">
          {/* Create Room Card */}
          <Card className="flex-1 p-8 flex flex-col items-center justify-center text-center">
            <h2 className="text-xl font-semibold mb-4 text-gray-100">
              Create a Room
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Start a new coding duel and invite your opponent
            </p>
            <button className="w-full px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors">
              Create Room
            </button>
          </Card>

          {/* Join Room Card */}
          <Card className="flex-1 p-8 flex flex-col items-center justify-center text-center">
            <h2 className="text-xl font-semibold mb-4 text-gray-100">
              Join a Room
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Enter a room code to join an existing duel
            </p>
            <div className="w-full flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 transition-colors"
              />
              <button className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap">
                Join Room
              </button>
            </div>
          </Card>
        </div>

        {/* Leaderboard Card */}
        <Card className="w-full max-w-4xl p-8">
          <h2 className="text-xl font-semibold mb-6 text-gray-100">
            Current Rooms Leaderboard
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-3 text-gray-400 font-medium text-sm">
                    Rank
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-sm">
                    Room
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-sm">
                    Players
                  </th>
                  <th className="pb-3 text-gray-400 font-medium text-sm">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Placeholder rows */}
                <tr className="border-b border-white/5">
                  <td className="py-4 text-gray-300">#1</td>
                  <td className="py-4 text-gray-300">Elite Arena</td>
                  <td className="py-4 text-gray-400">2/2</td>
                  <td className="py-4">
                    <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full">
                      Live
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-4 text-gray-300">#2</td>
                  <td className="py-4 text-gray-300">Code Masters</td>
                  <td className="py-4 text-gray-400">1/2</td>
                  <td className="py-4">
                    <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                      Waiting
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-4 text-gray-300">#3</td>
                  <td className="py-4 text-gray-300">Debug Dojo</td>
                  <td className="py-4 text-gray-400">2/2</td>
                  <td className="py-4">
                    <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full">
                      Live
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-4 text-gray-300">#4</td>
                  <td className="py-4 text-gray-300">Algorithm Arena</td>
                  <td className="py-4 text-gray-400">0/2</td>
                  <td className="py-4">
                    <span className="px-2 py-1 text-xs bg-gray-500/20 text-gray-400 rounded-full">
                      Open
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
