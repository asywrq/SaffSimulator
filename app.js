(function () {
  'use strict';

  const canvas = document.getElementById('surauCanvas');
  const ctx = canvas.getContext('2d');

  // Perfect Square Surau Geometry inside 420x420 logical canvas
  const SURAU = {
    left: 24,
    top: 28,
    right: 396,
    bottom: 396,
    size: 368,
    midX: 210,
    midY: 212
  };

  // Back-left 1/4 square is the Women's Partition: x in [24, 210], y in [212, 396]
  const WOMEN_ZONE = {
    left: 24,
    top: 212,
    right: 210,
    bottom: 396,
    centerX: 117
  };

  // Doors on the bottom/back wall (y = 396)
  const DOORS = {
    women: { x: 117, y: 396, width: 34 },
    men: { x: 228, y: 396, width: 36 }
  };

  // Row Y coordinates (where worshipper center stands; heels rest at y + 7 on the yellow carpet line)
  const IMAM_POS = { x: 210, y: 58 };
  const MEN_ROWS_FULL = [102, 146, 190]; // Full width of square above y=212
  const MEN_ROWS_RIGHT = [242, 286, 330]; // Right half of square below y=212
  const WOMEN_ROWS_FRONT_TO_BACK = [244, 288, 332]; // Inside back-left 1/4 square

  // Full-width row X slots centered on Imam (x = 210), ordered Center -> Right -> Left -> Right -> Left
  const FULL_ROW_X_CENTER_OUT = [210, 242, 178, 274, 146, 306, 114, 338, 82];
  // Right-half row X slots (for rows alongside the women's partition)
  const RIGHT_HALF_X = [242, 274, 306, 338, 370];
  // Women's partition X slots centered at x = 117, ordered Center -> Right -> Left
  const WOMEN_ROW_X_CENTER_OUT = [117, 149, 85, 181, 53];

  // State
  let worshippers = [];
  let exitingPeople = [];
  let nextId = 1;
  let hoveredPersonId = null;

  const config = {
    hasPartition: true,
    autoPullSolo: true,
    boysMode: 'row_behind', // 'row_behind' | 'interspersed'
    girlsMode: 'with_women' // 'with_women' | 'behind_women'
  };

  // DOM Elements
  const statTotal = document.getElementById('statTotal');
  const statMen = document.getElementById('statMen');
  const statWomen = document.getElementById('statWomen');
  const statChair = document.getElementById('statChair');

  // Create a worshipper entering from the appropriate door
  function createWorshipper(type, seatMode) {
    const isFemale = type === 'woman' || type === 'girl';
    const door = isFemale ? DOORS.women : DOORS.men;
    const startX = door.x + (Math.random() * 4 - 2);
    const startY = door.y - 4;

    const person = {
      id: nextId++,
      type: type, // 'man' | 'boy' | 'woman' | 'girl'
      seatMode: seatMode || 'standing', // 'standing' | 'chair' | 'floor'
      role: 'makmum', // 'imam' | 'female_imam' | 'makmum'
      x: startX,
      y: startY,
      targetX: startX,
      targetY: startY,
      waypoints: [],
      stepPauseTimer: 0,
      stepDistanceAccum: 0,
      useStepPause: false,
      arrivalOrder: nextId,
      isSettled: false
    };

    worshippers.push(person);
    return person;
  }

  // Set target coordinates with smooth doorway-aware waypoints
  function assignTarget(person, tx, ty, options) {
    options = options || {};
    const dist = Math.hypot(tx - person.x, ty - person.y);
    person.targetX = tx;
    person.targetY = ty;

    if (dist < 1.2) {
      person.x = tx;
      person.y = ty;
      person.waypoints = [];
      person.isSettled = true;
      return;
    }

    person.useStepPause = Boolean(options.useStepPause);
    person.waypoints = [];

    const isFemale = person.type === 'woman' || person.type === 'girl';
    if (options.directStep) {
      // Straight step into adjacent/front empty space without detouring
      person.waypoints.push({ x: tx, y: ty });
      return;
    }

    // If person just spawned near the Men's Door and needs to go to the upper hall, route through the central aisle first
    if (!isFemale && person.y > 350 && ty < 212) {
      person.waypoints.push({ x: 228, y: 204 });
      if (Math.abs(tx - 228) > 20) {
        person.waypoints.push({ x: tx, y: Math.min(204, ty + 22) });
      }
    } else if (isFemale && person.y > 365) {
      person.waypoints.push({ x: tx, y: Math.min(365, ty + 16) });
    }

    person.waypoints.push({ x: tx, y: ty });
  }

  // Arrange a single row WITHOUT rearranging existing people who have already settled in that row
  function layoutSingleRowStable(peopleInRow, yCoord, xSlotsCenterOut) {
    const chairUsers = peopleInRow.filter(function (p) { return p.seatMode === 'chair'; });
    const regularUsers = peopleInRow.filter(function (p) { return p.seatMode !== 'chair'; });

    // 1. Place regular (standing/floor) users on the first N center-out slots
    // Keep anyone already settled in this row at their exact X slot if valid; otherwise assign remaining slots by X order
    const countReg = regularUsers.length;
    const activeSlots = xSlotsCenterOut.slice(0, countReg);
    const activeSlotSet = new Set(activeSlots);
    const usedSlots = new Set();
    const unassigned = [];

    regularUsers.forEach(function (p) {
      if (p.isSettled && Math.abs(p.targetY - yCoord) < 4 && activeSlotSet.has(p.targetX) && !usedSlots.has(p.targetX)) {
        usedSlots.add(p.targetX);
        assignTarget(p, p.targetX, yCoord);
      } else {
        unassigned.push(p);
      }
    });

    // Available slots for newly arriving or row-shifting people, in center-out priority order
    const remainingSlots = activeSlots.filter(function (sx) { return !usedSlots.has(sx); });
    unassigned.forEach(function (p, idx) {
      const slotX = remainingSlots[idx] !== undefined ? remainingSlots[idx] : activeSlots[idx % activeSlots.length];
      usedSlots.add(slotX);
      assignTarget(p, slotX, yCoord);
    });

    // 2. Place chair users at the far ends of the row (Rightmost end first, then Leftmost end)
    const sortedAsc = xSlotsCenterOut.slice().sort(function (a, b) { return a - b; });
    const endCandidates = [];
    let leftIdx = 0;
    let rightIdx = sortedAsc.length - 1;
    while (leftIdx <= rightIdx) {
      if (!usedSlots.has(sortedAsc[rightIdx])) endCandidates.push(sortedAsc[rightIdx]);
      if (leftIdx !== rightIdx && !usedSlots.has(sortedAsc[leftIdx])) endCandidates.push(sortedAsc[leftIdx]);
      rightIdx--;
      leftIdx++;
    }

    chairUsers.forEach(function (p, idx) {
      const slotX = endCandidates[idx] !== undefined ? endCandidates[idx] : sortedAsc[sortedAsc.length - 1];
      assignTarget(p, slotX, yCoord);
    });
  }

  // Full Saff Layout (used when adding worshippers or changing mode toggles)
  function recalculateSaff() {
    const menAdults = worshippers.filter(function (p) { return p.type === 'man'; });
    const boys = worshippers.filter(function (p) { return p.type === 'boy'; });
    const womenAdults = worshippers.filter(function (p) { return p.type === 'woman'; });
    const girls = worshippers.filter(function (p) { return p.type === 'girl'; });

    worshippers.forEach(function (p) { p.role = 'makmum'; });

    // 1. Determine Imam
    let maleImam = null;
    if (menAdults.length > 0) {
      maleImam = menAdults[0];
      maleImam.role = 'imam';
    } else if (boys.length > 0) {
      maleImam = boys[0];
      maleImam.role = 'imam';
    }

    if (maleImam) {
      assignTarget(maleImam, IMAM_POS.x, IMAM_POS.y);
    }

    const remainingMen = menAdults.filter(function (p) { return p !== maleImam; });
    const remainingBoys = boys.filter(function (p) { return p !== maleImam; });
    const totalMaleMakmums = remainingMen.length + remainingBoys.length;

    // 2. Layout Male & Boy Makmums
    if (maleImam && totalMaleMakmums === 1) {
      const soloMakmum = remainingMen.length === 1 ? remainingMen[0] : remainingBoys[0];
      assignTarget(soloMakmum, IMAM_POS.x + 34, IMAM_POS.y + 10);
    } else if (totalMaleMakmums >= 2) {
      const rowCapacities = [
        { y: MEN_ROWS_FULL[0], slots: FULL_ROW_X_CENTER_OUT },
        { y: MEN_ROWS_FULL[1], slots: FULL_ROW_X_CENTER_OUT },
        { y: MEN_ROWS_FULL[2], slots: FULL_ROW_X_CENTER_OUT },
        { y: MEN_ROWS_RIGHT[0], slots: RIGHT_HALF_X },
        { y: MEN_ROWS_RIGHT[1], slots: RIGHT_HALF_X },
        { y: MEN_ROWS_RIGHT[2], slots: RIGHT_HALF_X }
      ];

      if (config.boysMode === 'interspersed' || remainingMen.length === 0) {
        const combinedPool = remainingMen.concat(remainingBoys);
        const rows = [];
        let cursor = 0;
        for (let r = 0; r < rowCapacities.length && cursor < combinedPool.length; r++) {
          const cap = rowCapacities[r].slots.length;
          rows.push(combinedPool.slice(cursor, cursor + cap));
          cursor += cap;
        }
        if (config.autoPullSolo && rows.length >= 2) {
          const lastRow = rows[rows.length - 1];
          const prevRow = rows[rows.length - 2];
          if (lastRow.length === 1 && prevRow.length >= 3) {
            const pulled = prevRow.pop();
            lastRow.unshift(pulled);
          }
        }
        rows.forEach(function (rGroup, idx) {
          layoutSingleRowStable(rGroup, rowCapacities[idx].y, rowCapacities[idx].slots);
        });
      } else {
        const menRows = [];
        let cursor = 0;
        for (let r = 0; r < rowCapacities.length && cursor < remainingMen.length; r++) {
          const cap = rowCapacities[r].slots.length;
          menRows.push(remainingMen.slice(cursor, cursor + cap));
          cursor += cap;
        }
        if (config.autoPullSolo && menRows.length >= 2) {
          const lastMenRow = menRows[menRows.length - 1];
          const prevMenRow = menRows[menRows.length - 2];
          if (lastMenRow.length === 1 && prevMenRow.length >= 3) {
            const pulled = prevMenRow.pop();
            lastMenRow.unshift(pulled);
          }
        }
        menRows.forEach(function (rGroup, idx) {
          layoutSingleRowStable(rGroup, rowCapacities[idx].y, rowCapacities[idx].slots);
        });

        let nextRowIdx = menRows.length;
        if (remainingMen.length === 1 && remainingBoys.length >= 1) {
          const mixedFirstRow = remainingMen.concat(remainingBoys.slice(0, 8));
          layoutSingleRowStable(mixedFirstRow, rowCapacities[0].y, rowCapacities[0].slots);
        } else if (remainingBoys.length > 0) {
          let bCursor = 0;
          while (bCursor < remainingBoys.length && nextRowIdx < rowCapacities.length) {
            const rMeta = rowCapacities[nextRowIdx];
            const slice = remainingBoys.slice(bCursor, bCursor + rMeta.slots.length);
            layoutSingleRowStable(slice, rMeta.y, rMeta.slots);
            bCursor += rMeta.slots.length;
            nextRowIdx++;
          }
        }
      }
    }

    // 3. Layout Women & Girls inside the Back-Left 1/4 Partition
    const totalFemales = womenAdults.length + girls.length;
    if (totalFemales > 0) {
      const femaleRowYs = config.hasPartition
        ? WOMEN_ROWS_FRONT_TO_BACK.slice()
        : WOMEN_ROWS_FRONT_TO_BACK.slice().reverse();

      if (!maleImam) {
        const femImam = womenAdults.length > 0 ? womenAdults[0] : girls[0];
        femImam.role = 'female_imam';
        const otherFemales = womenAdults.concat(girls).filter(function (p) { return p !== femImam; });

        if (otherFemales.length === 0) {
          assignTarget(femImam, WOMEN_ZONE.centerX, femaleRowYs[0]);
        } else if (otherFemales.length === 1) {
          assignTarget(femImam, WOMEN_ZONE.centerX, femaleRowYs[0] - 4);
          assignTarget(otherFemales[0], WOMEN_ZONE.centerX + 32, femaleRowYs[0]);
        } else {
          assignTarget(femImam, WOMEN_ZONE.centerX, femaleRowYs[0] - 4);
          const row1SlotsAroundImam = [149, 85, 181, 53];
          layoutSingleRowStable(otherFemales.slice(0, 4), femaleRowYs[0], row1SlotsAroundImam);
          if (otherFemales.length > 4) {
            layoutSingleRowStable(otherFemales.slice(4, 9), femaleRowYs[1], WOMEN_ROW_X_CENTER_OUT);
          }
          if (otherFemales.length > 9) {
            layoutSingleRowStable(otherFemales.slice(9, 14), femaleRowYs[2], WOMEN_ROW_X_CENTER_OUT);
          }
        }
      } else {
        if (config.girlsMode === 'with_women' || womenAdults.length === 0) {
          const allFemales = womenAdults.concat(girls);
          const fRows = [];
          let fCursor = 0;
          for (let r = 0; r < femaleRowYs.length && fCursor < allFemales.length; r++) {
            fRows.push(allFemales.slice(fCursor, fCursor + 5));
            fCursor += 5;
          }
          if (config.autoPullSolo && fRows.length >= 2) {
            const lastFRow = fRows[fRows.length - 1];
            const prevFRow = fRows[fRows.length - 2];
            if (lastFRow.length === 1 && prevFRow.length >= 3) {
              const pulledF = prevFRow.pop();
              lastFRow.unshift(pulledF);
            }
          }
          fRows.forEach(function (rGroup, idx) {
            layoutSingleRowStable(rGroup, femaleRowYs[idx], WOMEN_ROW_X_CENTER_OUT);
          });
        } else {
          const adultWRows = [];
          let wCursor = 0;
          for (let r = 0; r < femaleRowYs.length && wCursor < womenAdults.length; r++) {
            adultWRows.push(womenAdults.slice(wCursor, wCursor + 5));
            wCursor += 5;
          }
          adultWRows.forEach(function (rGroup, idx) {
            layoutSingleRowStable(rGroup, femaleRowYs[idx], WOMEN_ROW_X_CENTER_OUT);
          });
          let nextFRowIdx = adultWRows.length;
          if (girls.length > 0 && nextFRowIdx < femaleRowYs.length) {
            layoutSingleRowStable(girls.slice(0, 5), femaleRowYs[nextFRowIdx], WOMEN_ROW_X_CENTER_OUT);
          }
        }
      }
    }

    updateStatsUI();
  }

  // Targeted Empty-Space Filling Chain (Al-Kafi #912):
  // Instead of reshuffling the whole congregation when 1 spot (gapX, gapY) becomes empty,
  // 1) If there is a row directly behind gapY with a non-chair worshipper, the person closest to gapX in that back row
  //    steps straight forward into (gapX, gapY), and we recursively fill their vacated spot in the back row.
  // 2) If there is no one in the row behind, ONLY the people on ONE side of gapX in the same row slide 1 slot (32px)
  //    inward toward gapX to close the gap, while the other side stays completely still!
  function fillEmptySpaceChain(gapX, gapY, isFemaleSection) {
    const allRowYs = isFemaleSection
      ? (config.hasPartition ? WOMEN_ROWS_FRONT_TO_BACK.slice() : WOMEN_ROWS_FRONT_TO_BACK.slice().reverse())
      : MEN_ROWS_FULL.concat(MEN_ROWS_RIGHT);

    // Find which row index gapY belongs to
    let rowIdx = -1;
    for (let i = 0; i < allRowYs.length; i++) {
      if (Math.abs(allRowYs[i] - gapY) < 10) {
        rowIdx = i;
        break;
      }
    }

    if (rowIdx === -1) return;

    // Check if there is a next row behind with any non-chair makmum
    if (rowIdx + 1 < allRowYs.length) {
      const nextRowY = allRowYs[rowIdx + 1];
      const backRowCandidates = worshippers.filter(function (p) {
        const pFem = p.type === 'woman' || p.type === 'girl';
        return pFem === isFemaleSection &&
          p.role === 'makmum' &&
          p.seatMode !== 'chair' &&
          Math.abs(p.targetY - nextRowY) < 10;
      });

      if (backRowCandidates.length > 0) {
        // Pick the person in the back row closest horizontally to gapX
        backRowCandidates.sort(function (a, b) {
          return Math.abs(a.targetX - gapX) - Math.abs(b.targetX - gapX);
        });
        const steppingUp = backRowCandidates[0];
        const prevX = steppingUp.targetX;
        const prevY = steppingUp.targetY;

        assignTarget(steppingUp, gapX, gapY, { useStepPause: true, directStep: true });
        // Now fill the spot they just vacated in the back row
        fillEmptySpaceChain(prevX, prevY, isFemaleSection);
        return;
      }
    }

    // No one in the row behind -> Slide ONLY one side of the current row inward by 1 slot (32px)
    const sameRowPeople = worshippers.filter(function (p) {
      const pFem = p.type === 'woman' || p.type === 'girl';
      return pFem === isFemaleSection &&
        p.role === 'makmum' &&
        p.seatMode !== 'chair' &&
        Math.abs(p.targetY - gapY) < 10;
    });

    if (sameRowPeople.length === 0) return;

    const leftSide = sameRowPeople.filter(function (p) { return p.targetX < gapX - 4; })
      .sort(function (a, b) { return b.targetX - a.targetX; }); // Closest to gap first
    const rightSide = sameRowPeople.filter(function (p) { return p.targetX > gapX + 4; })
      .sort(function (a, b) { return a.targetX - b.targetX; }); // Closest to gap first

    // Slide whichever side has more people (or right side if equal) inward by 1 slot so nobody crosses sides
    if (rightSide.length >= leftSide.length && rightSide.length > 0) {
      let currentTargetX = gapX;
      rightSide.forEach(function (p) {
        const nextSlot = currentTargetX;
        currentTargetX = p.targetX;
        assignTarget(p, nextSlot, gapY, { useStepPause: true, directStep: true });
      });
    } else if (leftSide.length > 0) {
      let currentTargetX = gapX;
      leftSide.forEach(function (p) {
        const nextSlot = currentTargetX;
        currentTargetX = p.targetX;
        assignTarget(p, nextSlot, gapY, { useStepPause: true, directStep: true });
      });
    }
  }

  function updateStatsUI() {
    const menCount = worshippers.filter(function (p) { return p.type === 'man' || p.type === 'boy'; }).length;
    const womenCount = worshippers.filter(function (p) { return p.type === 'woman' || p.type === 'girl'; }).length;
    const chairCount = worshippers.filter(function (p) { return p.seatMode === 'chair' || p.seatMode === 'floor'; }).length;

    statTotal.textContent = String(worshippers.length);
    statMen.textContent = String(menCount);
    statWomen.textContent = String(womenCount);
    statChair.textContent = String(chairCount);
  }

  // Trigger Scenario 1: Imam Breaks Wudhu (Istikhlaf) — Clean Step-Forward & Gap Fill!
  function triggerImamBreaksWudhu() {
    const currentImam = worshippers.find(function (p) { return p.role === 'imam' || p.role === 'female_imam'; });
    if (!currentImam) return;

    const others = worshippers.filter(function (p) { return p.id !== currentImam.id; });
    worshippers = others;

    const isFem = currentImam.type === 'woman' || currentImam.type === 'girl';
    const exitDoor = isFem ? DOORS.women : DOORS.men;
    currentImam.waypoints = isFem
      ? [{ x: 38, y: currentImam.y }, { x: 38, y: 384 }, { x: exitDoor.x, y: exitDoor.y }]
      : [{ x: 382, y: currentImam.y }, { x: 382, y: 380 }, { x: exitDoor.x, y: exitDoor.y }];
    exitingPeople.push(currentImam);

    if (others.length === 0) {
      updateStatsUI();
      return;
    }

    const maleCandidates = others.filter(function (p) { return p.type === 'man' || p.type === 'boy'; });
    if (maleCandidates.length > 0) {
      // Prefer standing/floor makmums directly behind the Imam in Saf 1
      const standingCandidates = maleCandidates.filter(function (p) { return p.seatMode !== 'chair'; });
      const pool = standingCandidates.length > 0 ? standingCandidates : maleCandidates;

      pool.sort(function (a, b) {
        const da = Math.hypot(a.targetX - IMAM_POS.x, (a.targetY - IMAM_POS.y) * 1.5);
        const db = Math.hypot(b.targetX - IMAM_POS.x, (b.targetY - IMAM_POS.y) * 1.5);
        return da - db;
      });

      const khalifah = pool[0];
      const vacatedX = khalifah.targetX;
      const vacatedY = khalifah.targetY;

      khalifah.role = 'imam';
      // Ensure khalifah is first in worshippers array so future adds recognize him as Imam
      worshippers = [khalifah].concat(others.filter(function (p) { return p.id !== khalifah.id; }));

      // Khalifah steps straight forward into the Imam's Sejadah
      assignTarget(khalifah, IMAM_POS.x, IMAM_POS.y, { useStepPause: true, directStep: true });

      // Check how many male makmums remain behind the new Imam
      const remainingMales = worshippers.filter(function (p) {
        return p.id !== khalifah.id && (p.type === 'man' || p.type === 'boy');
      });

      if (remainingMales.length === 1 && remainingMales[0].seatMode !== 'chair') {
        // Only 1 male makmum left -> steps to the right of the new Imam
        assignTarget(remainingMales[0], IMAM_POS.x + 34, IMAM_POS.y + 10, { useStepPause: true, directStep: true });
      } else if (remainingMales.length >= 1) {
        // Fill ONLY the single vacated spot (vacatedX, vacatedY) without rearranging anyone else!
        fillEmptySpaceChain(vacatedX, vacatedY, false);
      }
    } else {
      // Women-only congregation Istikhlaf
      recalculateSaff();
    }

    updateStatsUI();
  }

  // Trigger Emergency: Worshipper Faints / Passes Out (Darurat)
  function triggerWorshipperFaints(targetPerson) {
    const candidates = worshippers.filter(function (p) { return p.role !== 'imam'; });
    if (candidates.length === 0 && worshippers.length === 0) return;

    const victim = targetPerson || (candidates.length > 0 ? candidates[Math.floor(candidates.length / 2)] : worshippers[0]);
    const wasImam = victim.role === 'imam' || victim.role === 'female_imam';

    if (wasImam) {
      triggerImamBreaksWudhu();
      return;
    }

    const victimX = victim.targetX;
    const victimY = victim.targetY;
    worshippers = worshippers.filter(function (p) { return p.id !== victim.id; });

    const isFem = victim.type === 'woman' || victim.type === 'girl';
    const exitDoor = isFem ? DOORS.women : DOORS.men;

    // Nearest neighbour in the same section breaks prayer to help escort victim out
    const sameSectionPool = worshippers.filter(function (p) {
      const pFem = p.type === 'woman' || p.type === 'girl';
      return pFem === isFem && p.role !== 'imam' && p.seatMode !== 'chair';
    });

    let helper = null;
    let helperX = null;
    let helperY = null;
    if (sameSectionPool.length > 0) {
      sameSectionPool.sort(function (a, b) {
        return Math.hypot(a.targetX - victimX, a.targetY - victimY) - Math.hypot(b.targetX - victimX, b.targetY - victimY);
      });
      helper = sameSectionPool[0];
      helperX = helper.targetX;
      helperY = helper.targetY;
      worshippers = worshippers.filter(function (p) { return p.id !== helper.id; });
    }

    victim.isFainted = true;
    victim.faintPause = 45;
    victim.waypoints = [{ x: exitDoor.x, y: exitDoor.y }];
    exitingPeople.push(victim);

    if (helper) {
      helper.faintPause = 38;
      helper.waypoints = [
        { x: victim.x + 10, y: victim.y + 4 },
        { x: exitDoor.x + 10, y: exitDoor.y }
      ];
      exitingPeople.push(helper);
    }

    // Fill the vacated spot(s) directly without scrambling the rows
    fillEmptySpaceChain(victimX, victimY, isFem);
    if (helperX !== null && helperY !== null) {
      // Re-find where the second gap is and close it smoothly
      fillEmptySpaceChain(helperX, helperY, isFem);
    }

    // If only 1 male makmum remains with the Imam, move him to the Imam's right
    const maleImam = worshippers.find(function (p) { return p.role === 'imam'; });
    const remMales = worshippers.filter(function (p) { return p.role !== 'imam' && (p.type === 'man' || p.type === 'boy'); });
    if (maleImam && remMales.length === 1 && remMales[0].seatMode !== 'chair') {
      assignTarget(remMales[0], IMAM_POS.x + 34, IMAM_POS.y + 10, { useStepPause: true, directStep: true });
    }

    updateStatsUI();
  }

  // Update loop for smooth walking & step-pause-step animations
  function updateSimulation() {
    worshippers.forEach(function (p) {
      if (p.stepPauseTimer > 0) {
        p.stepPauseTimer--;
        return;
      }

      if (p.waypoints && p.waypoints.length > 0) {
        const wp = p.waypoints[0];
        const dx = wp.x - p.x;
        const dy = wp.y - p.y;
        const dist = Math.hypot(dx, dy);
        const speed = p.useStepPause ? 1.25 : 2.75;

        if (dist <= speed) {
          p.x = wp.x;
          p.y = wp.y;
          p.waypoints.shift();
          if (p.waypoints.length === 0) {
            p.useStepPause = false;
            p.stepDistanceAccum = 0;
            p.isSettled = true;
          }
        } else {
          p.x += (dx / dist) * speed;
          p.y += (dy / dist) * speed;

          if (p.useStepPause) {
            p.stepDistanceAccum += speed;
            if (p.stepDistanceAccum >= 18) {
              p.stepDistanceAccum = 0;
              p.stepPauseTimer = 16; // Pause between 1-2 steps (tuma'ninah)
            }
          }
        }
      }
    });

    for (let i = exitingPeople.length - 1; i >= 0; i--) {
      const ep = exitingPeople[i];
      if (ep.faintPause && ep.faintPause > 0) {
        ep.faintPause--;
        continue;
      }
      if (ep.waypoints && ep.waypoints.length > 0) {
        const wp = ep.waypoints[0];
        const dx = wp.x - ep.x;
        const dy = wp.y - ep.y;
        const dist = Math.hypot(dx, dy);
        const speed = 2.2;
        if (dist <= speed) {
          ep.x = wp.x;
          ep.y = wp.y;
          ep.waypoints.shift();
        } else {
          ep.x += (dx / dist) * speed;
          ep.y += (dy / dist) * speed;
        }
      } else {
        exitingPeople.splice(i, 1);
      }
    }
  }

  // Helper to draw a Yellow Heel-Line Carpet Stripe (Garisan Saf Kuning)
  function drawYellowHeelCarpetStripe(x1, x2, rowY) {
    const heelY = rowY + 7;
    ctx.save();
    // Main woven golden-yellow heel stripe
    ctx.fillStyle = '#ebca4b';
    ctx.fillRect(x1, heelY - 2.5, x2 - x1, 5);

    // Top and bottom woven gold trim lines
    ctx.strokeStyle = '#b58d1d';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, heelY - 2.5);
    ctx.lineTo(x2, heelY - 2.5);
    ctx.moveTo(x1, heelY + 2.5);
    ctx.lineTo(x2, heelY + 2.5);
    ctx.stroke();

    // Subtle woven diamond motif along the yellow stripe
    ctx.fillStyle = '#fff1a8';
    for (let mx = x1 + 10; mx < x2 - 6; mx += 16) {
      ctx.fillRect(mx, heelY - 1, 4, 2);
    }
    ctx.restore();
  }

  // Helper to draw subtle blue carpet saff arch motifs above a heel line
  function drawCarpetRowArches(x1, x2, rowY) {
    const heelY = rowY + 7;
    const bandTop = heelY - 34;
    ctx.save();
    ctx.strokeStyle = 'rgba(130, 185, 235, 0.16)';
    ctx.lineWidth = 1;
    for (let sx = x1 + 8; sx + 28 <= x2 - 4; sx += 32) {
      ctx.beginPath();
      ctx.moveTo(sx, heelY - 3);
      ctx.lineTo(sx, bandTop + 10);
      ctx.quadraticCurveTo(sx + 13, bandTop, sx + 26, bandTop + 10);
      ctx.lineTo(sx + 26, heelY - 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Helper to draw an ornate Imam Sejadah at the Mihrab
  function drawImamSejadah(cx, cy) {
    const w = 34;
    const h = 44;
    const left = cx - w / 2;
    const top = cy - 26;
    const bottom = top + h;

    ctx.save();

    // Top & bottom fringed tassels (rumbai sejadah)
    ctx.strokeStyle = '#e8dec3';
    ctx.lineWidth = 1.2;
    for (let fx = left + 2; fx <= left + w - 2; fx += 3) {
      ctx.beginPath();
      ctx.moveTo(fx, top - 3.5);
      ctx.lineTo(fx, top);
      ctx.moveTo(fx, bottom);
      ctx.lineTo(fx, bottom + 3.5);
      ctx.stroke();
    }

    // Outer Sejadah Body (Deep Royal Navy & Crimson Border)
    ctx.fillStyle = '#7d1d29';
    ctx.strokeStyle = '#e8c455';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, 3);
    ctx.fill();
    ctx.stroke();

    // Inner Gold & Deep Blue Field
    ctx.fillStyle = '#12355b';
    ctx.strokeStyle = '#f0cf62';
    ctx.lineWidth = 1;
    ctx.fillRect(left + 3.5, top + 3.5, w - 7, h - 7);
    ctx.strokeRect(left + 3.5, top + 3.5, w - 7, h - 7);

    // Pointed Mihrab Arch (Kubah Sejadah)
    ctx.fillStyle = '#1b4d82';
    ctx.strokeStyle = '#f0cf62';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(left + 6.5, bottom - 8);
    ctx.lineTo(left + 6.5, top + 15);
    ctx.quadraticCurveTo(cx, top + 5, left + w - 6.5, top + 15);
    ctx.lineTo(left + w - 6.5, bottom - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hanging Mosque Lamp / Diamond Medallion inside the arch
    ctx.fillStyle = '#f5d76e';
    ctx.beginPath();
    ctx.arc(cx, top + 14, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Golden Heel Stripe at the bottom of the Imam's Sejadah
    ctx.fillStyle = '#ebca4b';
    ctx.fillRect(left + 5, cy + 5.5, w - 10, 3.2);

    ctx.restore();
  }

  // Draw the 2D Top-Down Square Surau Floor Plan
  function drawSurau() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Outer warm cream margin around the surau
    ctx.fillStyle = '#faf4e4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mihrab Niche at Top Center (x = 210, y = 28)
    ctx.save();
    ctx.fillStyle = '#18416b';
    ctx.strokeStyle = '#4e3c20';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(IMAM_POS.x, SURAU.top, 24, Math.PI, 0, false);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Main Square Surau Blue Carpet Base (368 x 368)
    const carpetGrad = ctx.createLinearGradient(SURAU.left, SURAU.top, SURAU.left, SURAU.bottom);
    carpetGrad.addColorStop(0, '#1c4b7a');
    carpetGrad.addColorStop(0.5, '#215487');
    carpetGrad.addColorStop(1, '#1a4570');
    ctx.fillStyle = carpetGrad;
    ctx.fillRect(SURAU.left, SURAU.top, SURAU.size, SURAU.size);

    // Inner Carpet Border Trim
    ctx.save();
    ctx.strokeStyle = 'rgba(235, 202, 75, 0.38)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(SURAU.left + 5, SURAU.top + 5, SURAU.size - 10, SURAU.size - 10);
    ctx.restore();

    // Back-Left 1/4 Square: Women's Space Carpet Tint
    ctx.fillStyle = config.hasPartition ? 'rgba(20, 48, 80, 0.25)' : 'rgba(20, 48, 80, 0.1)';
    ctx.fillRect(WOMEN_ZONE.left, WOMEN_ZONE.top, WOMEN_ZONE.right - WOMEN_ZONE.left, WOMEN_ZONE.bottom - WOMEN_ZONE.top);

    // Draw Woven Carpet Arch Motifs & Yellow Heel-Line Carpet Stripes
    // 1. Men's Full-Width Rows (Saf 1-3)
    MEN_ROWS_FULL.forEach(function (ry) {
      drawCarpetRowArches(SURAU.left + 8, SURAU.right - 8, ry);
      drawYellowHeelCarpetStripe(SURAU.left + 6, SURAU.right - 6, ry);
    });

    // 2. Men's Right-Half Rows (Saf 4-6)
    MEN_ROWS_RIGHT.forEach(function (ry) {
      drawCarpetRowArches(SURAU.midX + 6, SURAU.right - 8, ry);
      drawYellowHeelCarpetStripe(SURAU.midX + 4, SURAU.right - 6, ry);
    });

    // 3. Women's Rows inside Back-Left 1/4 Partition
    WOMEN_ROWS_FRONT_TO_BACK.forEach(function (ry) {
      drawCarpetRowArches(WOMEN_ZONE.left + 8, WOMEN_ZONE.right - 8, ry);
      drawYellowHeelCarpetStripe(WOMEN_ZONE.left + 6, WOMEN_ZONE.right - 6, ry);
    });

    // Ornate Imam Sejadah at the Mihrab
    drawImamSejadah(IMAM_POS.x, IMAM_POS.y);

    // Draw Square Surau Outer Walls (with openings for the 2 doors on the bottom wall)
    ctx.save();
    ctx.strokeStyle = '#4e3c20';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';

    // Top wall (left and right of Mihrab arch)
    ctx.beginPath();
    ctx.moveTo(SURAU.left, SURAU.top);
    ctx.lineTo(IMAM_POS.x - 24, SURAU.top);
    ctx.moveTo(IMAM_POS.x + 24, SURAU.top);
    ctx.lineTo(SURAU.right, SURAU.top);

    // Left wall & Right wall
    ctx.moveTo(SURAU.left, SURAU.top);
    ctx.lineTo(SURAU.left, SURAU.bottom);
    ctx.moveTo(SURAU.right, SURAU.top);
    ctx.lineTo(SURAU.right, SURAU.bottom);

    // Bottom wall in 3 segments around Women's Door and Men's Middle Door
    const wDoorL = DOORS.women.x - DOORS.women.width / 2;
    const wDoorR = DOORS.women.x + DOORS.women.width / 2;
    const mDoorL = DOORS.men.x - DOORS.men.width / 2;
    const mDoorR = DOORS.men.x + DOORS.men.width / 2;

    ctx.moveTo(SURAU.left, SURAU.bottom);
    ctx.lineTo(wDoorL, SURAU.bottom);
    ctx.moveTo(wDoorR, SURAU.bottom);
    ctx.lineTo(mDoorL, SURAU.bottom);
    ctx.moveTo(mDoorR, SURAU.bottom);
    ctx.lineTo(SURAU.right, SURAU.bottom);
    ctx.stroke();
    ctx.restore();

    // Draw Women's Partition (Back-Left 1/4 of Square) — No Text Labels
    ctx.save();
    if (config.hasPartition) {
      ctx.strokeStyle = '#e0c58f';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(WOMEN_ZONE.left, WOMEN_ZONE.top);
      ctx.lineTo(WOMEN_ZONE.right, WOMEN_ZONE.top);
      ctx.lineTo(WOMEN_ZONE.right, WOMEN_ZONE.bottom);
      ctx.stroke();

      // Curtain pleat nodes along the partition rail
      ctx.fillStyle = '#b59252';
      for (let cx = WOMEN_ZONE.left + 14; cx <= WOMEN_ZONE.right; cx += 16) {
        ctx.beginPath();
        ctx.arc(cx, WOMEN_ZONE.top, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let cy = WOMEN_ZONE.top + 14; cy < WOMEN_ZONE.bottom - 8; cy += 16) {
        ctx.beginPath();
        ctx.arc(WOMEN_ZONE.right, cy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = 'rgba(235, 202, 75, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(WOMEN_ZONE.left, WOMEN_ZONE.top);
      ctx.lineTo(WOMEN_ZONE.right, WOMEN_ZONE.top);
      ctx.lineTo(WOMEN_ZONE.right, WOMEN_ZONE.bottom);
      ctx.stroke();
    }
    ctx.restore();

    // Draw the 2 Entrance Doors on the Bottom/Back Wall (No Text Labels)
    drawDoorway(DOORS.women.x, DOORS.women.width, '#b58d3d');
    drawDoorway(DOORS.men.x, DOORS.men.width, '#b58d3d');

    // Draw Exiting / Fainted People
    exitingPeople.forEach(function (ep) {
      drawPersonTopDown(ep, true);
    });

    // Draw Active Worshippers
    worshippers.forEach(function (p) {
      drawPersonTopDown(p, false);
    });
  }

  function drawDoorway(centerX, width, color) {
    const leftX = centerX - width / 2;
    const wallY = SURAU.bottom;

    ctx.save();
    // Door threshold step
    ctx.fillStyle = '#e8dec3';
    ctx.fillRect(leftX, wallY - 3, width, 6);

    // Swinging door leaf
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(leftX, wallY);
    ctx.lineTo(leftX + width * 0.78, wallY - width * 0.62);
    ctx.stroke();

    // Swing arc
    ctx.strokeStyle = 'rgba(235, 202, 75, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(leftX, wallY, width * 0.92, -0.68, 0, false);
    ctx.stroke();
    ctx.restore();
  }

  function drawPersonTopDown(p, isExiting) {
    ctx.save();
    ctx.translate(p.x, p.y);

    const isSmall = p.type === 'boy' || p.type === 'girl';
    const scale = isSmall ? 0.82 : 1.0;

    // Color coding by group matching the legend
    let shoulderFill = '#3c5e35'; // Man
    let headFill = '#f5ead2';
    let capStroke = '#1e331a';

    if (p.role === 'imam') {
      shoulderFill = '#7c5c20';
      headFill = '#fffdf7';
      capStroke = '#42300d';
    } else if (p.type === 'boy') {
      shoulderFill = '#2e607a';
      capStroke = '#163547';
    } else if (p.type === 'woman') {
      shoulderFill = '#844969';
      headFill = '#f7edf3';
      capStroke = '#4a2237';
    } else if (p.type === 'girl') {
      shoulderFill = '#b56589';
      headFill = '#faeff5';
      capStroke = '#632c45';
    }

    if (isExiting) {
      ctx.globalAlpha = 0.85;
      if (p.isFainted) {
        shoulderFill = '#a63a2b';
      }
    }

    // Subtle hover highlight ring (no text labels)
    if (p.id === hoveredPersonId && !isExiting) {
      ctx.save();
      ctx.strokeStyle = '#f5d76e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 1. If Seated on Chair: Draw Chair Frame with Back Legs on the Yellow Heel Carpet Stripe (y = +7)
    if (p.seatMode === 'chair') {
      ctx.save();
      ctx.fillStyle = '#d9b38c';
      ctx.strokeStyle = '#5c3814';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-11, -6, 22, 13);
      ctx.strokeRect(-11, -6, 22, 13);

      ctx.fillStyle = '#8f5b28';
      ctx.fillRect(-12, 4, 24, 3.5);

      // Back chair legs resting on the yellow heel stripe
      ctx.fillStyle = '#3d1c05';
      ctx.beginPath();
      ctx.arc(-10, 7, 2.3, 0, Math.PI * 2);
      ctx.arc(10, 7, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.seatMode === 'floor') {
      // 2. If Seated on Floor: Draw seated posture base
      ctx.save();
      ctx.fillStyle = '#6e5034';
      ctx.strokeStyle = '#e8d7b4';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-12, -8, 24, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Heel markers resting right on the yellow heel carpet line (y = +7)
    if (!isExiting) {
      ctx.fillStyle = '#fbe580';
      ctx.beginPath();
      ctx.arc(-4.5 * scale, 7, 1.7, 0, Math.PI * 2);
      ctx.arc(4.5 * scale, 7, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shoulders (Top-down rounded capsule facing Qibla / North)
    ctx.scale(scale, scale);
    ctx.fillStyle = shoulderFill;
    ctx.strokeStyle = '#fffdf7';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-12, -5, 24, 11, 5.5);
    ctx.fill();
    ctx.stroke();

    // Head / Kopiah / Telekung
    ctx.fillStyle = headFill;
    ctx.strokeStyle = capStroke;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -1, 6.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Direction indicator toward Qibla (North, -Y)
    ctx.strokeStyle = capStroke;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -7.2);
    ctx.lineTo(0, -4.5);
    ctx.stroke();

    ctx.restore();
  }

  // Animation Loop
  let animFrameId = null;
  function tick() {
    updateSimulation();
    drawSurau();
    animFrameId = requestAnimationFrame(tick);
  }

  // Event Listeners for Controls
  document.getElementById('btnAddMan').addEventListener('click', function () {
    createWorshipper('man', 'standing');
    recalculateSaff();
  });

  document.getElementById('btnAddWoman').addEventListener('click', function () {
    createWorshipper('woman', 'standing');
    recalculateSaff();
  });

  document.getElementById('btnAddBoy').addEventListener('click', function () {
    createWorshipper('boy', 'standing');
    recalculateSaff();
  });

  document.getElementById('btnAddGirl').addEventListener('click', function () {
    createWorshipper('girl', 'standing');
    recalculateSaff();
  });

  document.getElementById('btnAddManChair').addEventListener('click', function () {
    createWorshipper('man', 'chair');
    recalculateSaff();
  });

  document.getElementById('btnAddManFloor').addEventListener('click', function () {
    createWorshipper('man', 'floor');
    recalculateSaff();
  });

  document.getElementById('btnAddWomanChair').addEventListener('click', function () {
    createWorshipper('woman', 'chair');
    recalculateSaff();
  });

  document.getElementById('btnAddBatchMen').addEventListener('click', function () {
    for (let i = 0; i < 5; i++) {
      createWorshipper('man', 'standing');
    }
    recalculateSaff();
  });

  document.getElementById('btnImamBreaks').addEventListener('click', function () {
    triggerImamBreaksWudhu();
  });

  document.getElementById('btnMakmumFaints').addEventListener('click', function () {
    triggerWorshipperFaints(null);
  });

  // Presets & Reset inside Add Jemaah section
  document.getElementById('btnPreset1on1').addEventListener('click', function () {
    worshippers = [];
    exitingPeople = [];
    createWorshipper('man', 'standing');
    createWorshipper('man', 'standing');
    recalculateSaff();
  });

  document.getElementById('btnPresetFull').addEventListener('click', function () {
    worshippers = [];
    exitingPeople = [];
    for (let m = 0; m < 10; m++) createWorshipper('man', 'standing');
    createWorshipper('man', 'chair');
    createWorshipper('man', 'floor');
    for (let b = 0; b < 3; b++) createWorshipper('boy', 'standing');
    for (let w = 0; w < 5; w++) createWorshipper('woman', 'standing');
    createWorshipper('woman', 'chair');
    for (let g = 0; g < 2; g++) createWorshipper('girl', 'standing');
    recalculateSaff();
  });

  document.getElementById('btnReset').addEventListener('click', function () {
    worshippers = [];
    exitingPeople = [];
    updateStatsUI();
  });

  // Configuration Toggles
  document.getElementById('chkPartition').addEventListener('change', function (e) {
    config.hasPartition = e.target.checked;
    // Allow women to re-align to front vs back row when partition is toggled
    worshippers.forEach(function (p) {
      if (p.type === 'woman' || p.type === 'girl') p.isSettled = false;
    });
    recalculateSaff();
  });

  document.getElementById('chkAutoPull').addEventListener('change', function (e) {
    config.autoPullSolo = e.target.checked;
    recalculateSaff();
  });

  document.getElementById('selBoysMode').addEventListener('change', function (e) {
    config.boysMode = e.target.value;
    worshippers.forEach(function (p) {
      if (p.type === 'man' || p.type === 'boy') p.isSettled = false;
    });
    recalculateSaff();
  });

  document.getElementById('selGirlsMode').addEventListener('change', function (e) {
    config.girlsMode = e.target.value;
    worshippers.forEach(function (p) {
      if (p.type === 'woman' || p.type === 'girl') p.isSettled = false;
    });
    recalculateSaff();
  });

  // Canvas Hover & Click Interaction
  function getCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY
    };
  }

  canvas.addEventListener('mousemove', function (evt) {
    const pt = getCanvasCoords(evt);
    let found = null;
    for (let i = worshippers.length - 1; i >= 0; i--) {
      const p = worshippers[i];
      if (Math.hypot(pt.x - p.x, pt.y - p.y) <= 14) {
        found = p;
        break;
      }
    }
    hoveredPersonId = found ? found.id : null;
  });

  canvas.addEventListener('click', function (evt) {
    const pt = getCanvasCoords(evt);
    let clicked = null;
    for (let i = worshippers.length - 1; i >= 0; i--) {
      const p = worshippers[i];
      if (Math.hypot(pt.x - p.x, pt.y - p.y) <= 15) {
        clicked = p;
        break;
      }
    }
    if (!clicked) return;

    if (clicked.role === 'imam' || clicked.role === 'female_imam') {
      triggerImamBreaksWudhu();
    } else {
      triggerWorshipperFaints(clicked);
    }
  });

  function initDefaultDemo() {
    createWorshipper('man', 'standing'); // Imam
    createWorshipper('man', 'standing'); // Man 1
    createWorshipper('man', 'standing'); // Man 2
    createWorshipper('man', 'standing'); // Man 3
    createWorshipper('man', 'chair');    // Man on Chair at end of saf
    createWorshipper('boy', 'standing'); // Boy behind men
    createWorshipper('woman', 'standing'); // Woman 1 in back-left partition
    createWorshipper('girl', 'standing');  // Girl 1 with women
    recalculateSaff();
  }

  window.addEventListener('load', function () {
    initDefaultDemo();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    tick();
  });
})();
