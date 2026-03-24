from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_match_remove_matchevent_match_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="match",
            name="away_score",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="match",
            name="home_score",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
