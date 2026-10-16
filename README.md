# SaffSimulator

An interactive 2D top-down congregation prayer (*Solat Berjemaah*) and row (*Saf*) alignment visualizer based on **Mazhab al-Syafie** and **Malaysian Fatwa** guidelines (*Pejabat Mufti Wilayah Persekutuan*).

## Features & Scenarios Included

1. **Perfect Square Surau Floor Plan (2D Top-Down)**:
   - **Women's Partition (`Ruang Muslimat`)**: Positioned on the back-left 1/4 of the square (`x ∈ [0, 0.5]`, `y ∈ [0.5, 1.0]`).
   - **Two Entrance Doors on the Bottom/Back Wall**:
     - **Men's Door**: Located in the middle of the bottom/back wall.
     - **Women's Door**: Located on the bottom/back wall leading directly into the back-left 1/4 women's partition.
   - **Walking Path Animations**: Every added worshipper spawns at their respective back door and walks smoothly to their assigned spot in the saff.

2. **Scenario 1 — Imam Breaks Wudhu (`Istikhlaf`) & Refilling the Saff**:
   - The outgoing Imam exits along the side aisle to the door.
   - The makmum directly behind the Imam (*Khalifah*) steps forward into the Mihrab using a **1–2 step + pause (`tuma'ninah`)** movement so as not to violate the 3-consecutive-step rule (*tiga langkah berturut-turut*).
   - The gap left in Saf 1 is automatically filled from Row 2 or by adjacent makmums sliding inward.

3. **Emergency Scenario — Worshipper Faints / Passes Out (`Darurat`)**:
   - Triggering a fainting emergency causes the nearest neighbour to immediately break their prayer (*Al-Darurah Tubih al-Mahzurat* — *Irsyad Hukum #332*) to assist and escort the fainted worshipper out through the door, while the remaining congregation closes the gap in the saff.

4. **Scenario 2 — Adding Boys (`Mumayyiz`) & Girls**:
   - Discerning boys (*kanak-kanak lelaki mumayyiz*) form their row behind adult men by default (*Bayan Linnas #264*), with a toggle for Imam al-Mawardi's interspersed/early-arrival view.
   - Young girls (*kanak-kanak perempuan*) pray alongside adult women in the women's partition (*Irsyad Hukum #889*), with a toggle for the secondary *Qiyas* row-behind view.

5. **Scenario 3 — Women's Saff Alignment (`Front vs. Back` & `Partition Toggle`)**:
   - With the partition enabled (*Ada Penghadang/Tabir*), women start from the **frontmost row of their partitioned space** (*Irsyad Fatwa Ramadan #237* & *Tinta Mufti Bil. 82/2026*).
   - Toggling the partition off (*Tiada Penghadang*) dynamically shifts the women's rows to start from the **backmost row** of their area.
   - If only women are in the surau, the first woman acts as *Imam Perempuan* standing in the middle of the first row with a slight heel lead (*taqaddum yasir* — *Irsyad Hukum #464*).

6. **Scenario 4 — Chair (`Solat Atas Kerusi`) & Floor-Seated (`Duduk Atas Lantai`) Worshippers**:
   - Chair users are placed at the **outer ends of the saff (`di hujung saf`)** with the **back legs of the chair** aligned on the row's heel line (*Bayan Linnas #71* & *Tahqiq al-Masail #2*).
   - Floor-seated worshippers align their **buttocks (`punggung`)** on the row's heel line.

## Project Structure

- `index.html` — Main HTML layout and controls.
- `styles.css` — Beige / pastel yellow / cream theme with *Times New Roman* (italic) + *Arial* typography.
- `app.js` — 2D canvas floor plan renderer, pathfinding animation engine, and Mazhab al-Syafie saff solver.
