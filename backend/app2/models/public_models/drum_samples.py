import uuid
from sqlalchemy import Column, Enum
from sqlmodel import Field, SQLModel
from app2.models.base import DrumSamplePublicBase, all_optional
from app2.models.enums.storage_type_literal import StorageTypeLiteral, DEFAULT_PUBLIC_DRUM


class DrumSamplePublic(DrumSamplePublicBase, table=True):
    """Drum sample model"""

    __tablename__ = "drum_samples_public"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    
    storage_type: StorageTypeLiteral = Field(
        default=DEFAULT_PUBLIC_DRUM,
        sa_column=Column(
            Enum(
                "USER_AUDIO", "USER_SAMPLE", "PUBLIC_DRUM", "PUBLIC_SOUNDFONT",
                name="storagetype",  # Match the database enum name (no underscore)
                create_type=False
            ),
            nullable=False,
            default=DEFAULT_PUBLIC_DRUM
        )
    )


class DrumSamplePublicCreate(DrumSamplePublicBase):
    """Drum sample create model"""

    pass


class DrumSamplePublicRead(DrumSamplePublicBase):
    """Drum sample read model"""

    id: uuid.UUID


class DrumSamplePublicUpdate(
    all_optional(DrumSamplePublicBase, "DrumSamplePublicUpdate")
):
    """Drum sample update model"""

    id: uuid.UUID
    pass


class DrumSamplePublicDelete(SQLModel):
    """Drum sample delete model"""

    id: uuid.UUID
    pass
