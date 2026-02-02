"""
Script to populate the database with historical readings data.
This script is called during backend initialization.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from app.core.db import engine
from app.models import Building, Readings


# Historical readings data for each building
READINGS_DATA = {
    "Falcon": {
        "readings": [
            {"date": "2024-07-03", "low": None, "normal": 28894},
            {"date": "2024-08-02", "low": 4611, "normal": 29034},
            {"date": "2024-09-10", "low": 4665, "normal": 29230},
            {"date": "2024-10-09", "low": 4708, "normal": 29428},
            {"date": "2024-11-04", "low": 4748, "normal": 29631},
            {"date": "2024-12-02", "low": 4802, "normal": 29891},
            {"date": "2025-01-02", "low": 4863, "normal": 30166},
            {"date": "2025-02-03", "low": 4905, "normal": 30388},
            {"date": "2025-03-03", "low": 4967, "normal": 30630},
            {"date": "2025-04-01", "low": 5011, "normal": 30811},
            {"date": "2025-05-01", "low": 5053, "normal": 30972},
            {"date": "2025-06-02", "low": 5094, "normal": 31101},
            {"date": "2025-07-01", "low": 5130, "normal": 31211},
            {"date": "2025-08-01", "low": 5172, "normal": 31327},
            {"date": "2025-09-01", "low": 5206, "normal": 31436},
            {"date": "2025-10-04", "low": 5237, "normal": 31600},
            {"date": "2025-11-03", "low": 5265, "normal": 31780},
            {"date": "2025-12-01", "low": 5291, "normal": 32016},
        ]
    },
    "Martlett": {
        "readings": [
            {"date": "2024-07-03", "low": 34206, "normal": 52107},
            {"date": "2024-08-02", "low": 34352, "normal": 52312},
            {"date": "2024-09-10", "low": 34567, "normal": 52628},
            {"date": "2024-10-09", "low": 34778, "normal": 52929},
            {"date": "2024-11-04", "low": 35013, "normal": 53223},
            {"date": "2024-12-02", "low": 35333, "normal": 53609},
            {"date": "2025-01-02", "low": 35677, "normal": 54015},
            {"date": "2025-02-03", "low": 35999, "normal": 54339},
            {"date": "2025-03-03", "low": 36326, "normal": 54650},
            {"date": "2025-04-01", "low": 36596, "normal": 54871},
            {"date": "2025-05-01", "low": 36876, "normal": 55002},
            {"date": "2025-06-02", "low": 37181, "normal": 55052},
            {"date": "2025-07-01", "low": 37449, "normal": 55093},
            {"date": "2025-08-01", "low": 37741, "normal": 55138},
            {"date": "2025-09-01", "low": 38083, "normal": 55183},
            {"date": "2025-10-04", "low": 38425, "normal": 55228},
            {"date": "2025-11-03", "low": 38881, "normal": 55290},
            {"date": "2025-12-01", "low": 39320, "normal": 55366},
        ]
    },
    "Merlin": {
        "readings": [
            {"date": "2024-07-03", "low": 367348, "normal": 928066, "gas": 396928},
            {"date": "2024-08-02", "low": 367850, "normal": 929502, "gas": 397663},
            {"date": "2024-09-10", "low": 368530, "normal": 931379, "gas": 398591},
            {"date": "2024-10-09", "low": 369011, "normal": 932696, "gas": 400126},
            {"date": "2024-11-04", "low": 369559, "normal": 934158, "gas": 401996},
            {"date": "2024-12-02", "low": 370207, "normal": 935791, "gas": 405249},
            {"date": "2025-01-02", "low": 370931, "normal": 937600, "gas": 408955},
            {"date": "2025-02-03", "low": 371521, "normal": 939212, "gas": 414656},
            {"date": "2025-03-03", "low": 372311, "normal": 941132, "gas": 419176},
            {"date": "2025-04-01", "low": 372949, "normal": 942805, "gas": 421979},
            {"date": "2025-05-01", "low": 373544, "normal": 944347, "gas": 424045},
            {"date": "2025-06-02", "low": 374119, "normal": 945947, "gas": 425182},
            {"date": "2025-07-01", "low": 374610, "normal": 947331, "gas": 426168},
            {"date": "2025-08-01", "low": 375132, "normal": 948809, "gas": 426573},
            {"date": "2025-09-01", "low": 375645, "normal": 950270, "gas": 427242},
            {"date": "2025-10-04", "low": 376160, "normal": 951748, "gas": 428124},
            {"date": "2025-11-03", "low": 376845, "normal": 953537, "gas": 430505},
            {"date": "2025-12-01", "low": 377447, "normal": 955083, "gas": 433706},
        ]
    },
    "Northwood": {
        "readings": [
            {"date": "2024-07-03", "low": 394323, "normal": 193390, "gas": 347076},
            {"date": "2024-08-02", "low": 394700, "normal": 194313, "gas": 347886},
            {"date": "2024-09-10", "low": 395227, "normal": 195522, "gas": 348929},
            {"date": "2024-10-09", "low": 395636, "normal": 196495, "gas": 349813},
            {"date": "2024-11-04", "low": 396094, "normal": 197576, "gas": 351665},
            {"date": "2024-12-02", "low": 396612, "normal": 198835, "gas": 355315},
            {"date": "2025-01-02", "low": 397202, "normal": 200265, "gas": 359716},
            {"date": "2025-02-03", "low": 397655, "normal": 201721, "gas": 364787},
            {"date": "2025-03-03", "low": 398323, "normal": 202969, "gas": 369300},
            {"date": "2025-04-01", "low": 398852, "normal": 204237, "gas": 372775},
            {"date": "2025-05-01", "low": 399380, "normal": 205492, "gas": 375477},
            {"date": "2025-06-02", "low": 399782, "normal": 206441, "gas": 376662},
            {"date": "2025-07-01", "low": 400128, "normal": 207275, "gas": 377446},
            {"date": "2025-08-01", "low": 400493, "normal": 208143, "gas": 378203},
            {"date": "2025-09-01", "low": 400889, "normal": 209071, "gas": 378948},
            {"date": "2025-10-04", "low": 401244, "normal": 209919, "gas": 380050},
            {"date": "2025-11-03", "low": 401629, "normal": 210835, "gas": 382586},
            {"date": "2025-12-01", "low": 402046, "normal": 211842, "gas": 386321},
        ]
    },
    "Oak Lodge": {
        "readings": [
            {"date": "2024-07-03", "low": 365644, "normal": 532030, "gas": 513040},
            {"date": "2024-08-02", "low": 365996, "normal": 532844, "gas": 514188},
            {"date": "2024-09-10", "low": 366446, "normal": 533780, "gas": 515465},
            {"date": "2024-10-09", "low": 366820, "normal": 534680, "gas": 517322},
            {"date": "2024-11-04", "low": 367185, "normal": 535571, "gas": 519768},
            {"date": "2024-12-02", "low": 367583, "normal": 536559, "gas": 523462},
            {"date": "2025-01-02", "low": 368008, "normal": 537616, "gas": 527682},
            {"date": "2025-02-03", "low": 368422, "normal": 538544, "gas": 532689},
            {"date": "2025-03-03", "low": 368808, "normal": 539563, "gas": 537044},
            {"date": "2025-04-01", "low": 369177, "normal": 540462, "gas": 540435},
            {"date": "2025-05-01", "low": 369552, "normal": 541352, "gas": 542930},
            {"date": "2025-06-02", "low": 369871, "normal": 542082, "gas": 544001},
            {"date": "2025-07-01", "low": 370154, "normal": 542731, "gas": 544807},
            {"date": "2025-08-01", "low": 370466, "normal": 543403, "gas": 545724},
            {"date": "2025-09-01", "low": 370788, "normal": 544079, "gas": 546617},
            {"date": "2025-10-04", "low": 371110, "normal": 544816, "gas": 547901},
            {"date": "2025-11-03", "low": 371536, "normal": 545843, "gas": 550785},
            {"date": "2025-12-01", "low": 371898, "normal": 546743, "gas": 554000},
        ]
    },
    "Office": {
        "readings": [
            {"date": "2024-07-03", "normal": 1245},
            {"date": "2024-08-02", "normal": 1675},
            {"date": "2024-09-10", "normal": 2089},
            {"date": "2024-10-09", "normal": 2567},
            {"date": "2024-11-04", "normal": 2983},
            {"date": "2024-12-02", "normal": 3389},
            {"date": "2025-01-02", "normal": 3826},
            {"date": "2025-02-03", "normal": 4230},
            {"date": "2025-03-03", "normal": 4657},
            {"date": "2025-04-01", "normal": 5001},
            {"date": "2025-05-01", "normal": 5448},
            {"date": "2025-06-02", "normal": 6083},
            {"date": "2025-07-01", "normal": 6562},
            {"date": "2025-08-01", "normal": 7139},
            {"date": "2025-09-01", "normal": 7758},
            {"date": "2025-10-04", "normal": 8437},
            {"date": "2025-11-03", "normal": 9177},
            {"date": "2025-12-01", "normal": 9941},
        ]
    }
}


def populate_readings() -> None:
    """Populate the database with historical readings data."""
    with Session(engine) as session:
        for building_name, building_data in READINGS_DATA.items():
            # Find the building
            building = session.exec(
                select(Building).where(Building.nome == building_name)
            ).first()
            
            if not building:
                print(f"Building '{building_name}' not found, skipping...")
                continue
            
            print(f"Processing {building_name}...")
            
            # Process readings for this building
            readings = building_data["readings"]
            for reading_data in readings:
                date_str = reading_data["date"]
                # Parse date and add UTC timezone
                date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                
                # Create reading for Low (tipo=1) if present
                if reading_data.get("low") is not None:
                    low_value = reading_data["low"]
                    existing = session.exec(
                        select(Readings).where(
                            (Readings.building_id == building.id) &
                            (Readings.tipo == 1) &
                            (Readings.data == date)
                        )
                    ).first()
                    
                    if not existing:
                        reading = Readings(
                            id=uuid.uuid4(),
                            building_id=building.id,
                            tipo=1,  # Low
                            valor=low_value,
                            data=date
                        )
                        session.add(reading)
                        print(f"    Added Low reading: {date.date()} = {low_value}")
                
                # Create reading for Normal (tipo=2) if present
                if reading_data.get("normal") is not None:
                    normal_value = reading_data["normal"]
                    existing = session.exec(
                        select(Readings).where(
                            (Readings.building_id == building.id) &
                            (Readings.tipo == 2) &
                            (Readings.data == date)
                        )
                    ).first()
                    
                    if not existing:
                        reading = Readings(
                            id=uuid.uuid4(),
                            building_id=building.id,
                            tipo=2,  # Normal
                            valor=normal_value,
                            data=date
                        )
                        session.add(reading)
                        print(f"    Added Normal reading: {date.date()} = {normal_value}")
                
                # Create reading for Gas (tipo=4) if present
                if reading_data.get("gas") is not None:
                    gas_value = reading_data["gas"]
                    existing = session.exec(
                        select(Readings).where(
                            (Readings.building_id == building.id) &
                            (Readings.tipo == 4) &
                            (Readings.data == date)
                        )
                    ).first()
                    
                    if not existing:
                        reading = Readings(
                            id=uuid.uuid4(),
                            building_id=building.id,
                            tipo=4,  # Gas
                            valor=gas_value,
                            data=date
                        )
                        session.add(reading)
                        print(f"    Added Gas reading: {date.date()} = {gas_value}")
        
        session.commit()
        print("Historical readings populated successfully!")


if __name__ == "__main__":
    populate_readings()
